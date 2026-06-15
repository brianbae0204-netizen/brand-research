import { promises as fs } from "fs";
import path from "path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { DartCorp, DartCompanyInfo, FinancialSummaryRow } from "./types";

const DART_KEY = process.env.DART_API_KEY?.trim() || "";
const CACHE_DIR = path.join(process.cwd(), "cache");
const CORP_FILE = path.join(CACHE_DIR, "corp_codes.json");

let MEMO: DartCorp[] | null = null;

async function ensureDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {}
}

export async function loadCorpCodes(force = false): Promise<DartCorp[]> {
  if (MEMO && !force) return MEMO;
  await ensureDir();

  if (!force) {
    try {
      const data = await fs.readFile(CORP_FILE, "utf-8");
      MEMO = JSON.parse(data);
      return MEMO!;
    } catch {}
  }
  if (!DART_KEY) return [];

  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${DART_KEY}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`DART corpCode 다운로드 실패: ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const xmlFile = zip.file("CORPCODE.xml");
  if (!xmlFile) throw new Error("CORPCODE.xml 파일을 찾지 못했습니다.");
  const xml = await xmlFile.async("string");

  // parseTagValue:false — corp_code/stock_code의 앞자리 0이 숫자 변환으로 사라지는 것 방지
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
  const parsed = parser.parse(xml);
  const list = parsed?.result?.list ?? [];

  const codes: DartCorp[] = (Array.isArray(list) ? list : [list])
    .map((el: any) => ({
      corp_code: String(el.corp_code ?? "").trim(),
      corp_name: String(el.corp_name ?? "").trim(),
      stock_code: String(el.stock_code ?? "").trim(),
      is_listed: Boolean(String(el.stock_code ?? "").trim()),
    }))
    .filter((c: DartCorp) => c.corp_name);

  await fs.writeFile(CORP_FILE, JSON.stringify(codes), "utf-8");
  MEMO = codes;
  return codes;
}

export async function searchCorp(query: string, limit = 10): Promise<DartCorp[]> {
  const codes = await loadCorpCodes();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = codes.filter((c) => c.corp_name.toLowerCase() === q);
  const partial = codes.filter(
    (c) => c.corp_name.toLowerCase().includes(q) && !exact.includes(c)
  );
  return [...exact, ...partial]
    .sort((a, b) =>
      (a.is_listed === b.is_listed ? 0 : a.is_listed ? -1 : 1) ||
      a.corp_name.length - b.corp_name.length
    )
    .slice(0, limit);
}

export async function getCompanyInfo(corpCode: string): Promise<DartCompanyInfo | null> {
  if (!DART_KEY) return null;
  const url = `https://opendart.fss.or.kr/api/company.json?crtfc_key=${DART_KEY}&corp_code=${corpCode}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.status !== "000") return null;
  return data as DartCompanyInfo;
}

const KEY_ACCOUNTS: Record<string, string[]> = {
  매출액: ["매출액", "수익(매출액)", "영업수익"],
  매출원가: ["매출원가"],
  매출총이익: ["매출총이익"],
  영업이익: ["영업이익", "영업이익(손실)"],
  법인세차감전순이익: ["법인세차감전 순이익", "법인세비용차감전순이익"],
  당기순이익: ["당기순이익", "당기순이익(손실)"],
  자산총계: ["자산총계"],
  부채총계: ["부채총계"],
  자본총계: ["자본총계"],
  현금성자산: ["현금및현금성자산"],
  재고자산: ["재고자산"],
  매출채권: ["매출채권", "매출채권및기타채권", "매출채권및기타유동채권", "매출채권및기타유동자산"],
  단기차입금: ["단기차입금"],
  장기차입금: ["장기차입금"],
  영업활동현금흐름: ["영업활동 현금흐름", "영업활동으로 인한 현금흐름"],
  투자활동현금흐름: ["투자활동 현금흐름", "투자활동으로 인한 현금흐름"],
  재무활동현금흐름: ["재무활동 현금흐름", "재무활동으로 인한 현금흐름"],
};

async function getOneYear(corpCode: string, year: number, fs_div: "CFS" | "OFS") {
  if (!DART_KEY) return null;
  const url =
    `https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json` +
    `?crtfc_key=${DART_KEY}&corp_code=${corpCode}&bsns_year=${year}` +
    `&reprt_code=11011&fs_div=${fs_div}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.status !== "000" || !Array.isArray(data?.list)) return null;
  return { year, fs_div, items: data.list as Array<Record<string, string>> };
}

export async function getFinancials(corpCode: string, years?: number[]) {
  const currentYear = new Date().getFullYear();
  const targetYears = years || [currentYear - 1, currentYear - 2, currentYear - 3];

  const results = await Promise.all(
    targetYears.map(async (y) => {
      const cfs = await getOneYear(corpCode, y, "CFS");
      if (cfs) return cfs;
      return await getOneYear(corpCode, y, "OFS");
    })
  );
  return results.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getOneYear>>>[];
}

export function summarize(financials: Awaited<ReturnType<typeof getFinancials>>): FinancialSummaryRow[] {
  return financials.map((fin) => {
    const values: Record<string, number | null> = {};
    for (const [std, aliases] of Object.entries(KEY_ACCOUNTS)) {
      const item = fin.items.find((x) => aliases.includes((x.account_nm || "").trim()));
      const raw = item?.thstrm_amount?.replace(/,/g, "").trim();
      const n = raw ? Number(raw) : NaN;
      values[std] = Number.isFinite(n) ? n : null;
    }
    return { year: fin.year, fs_div: fin.fs_div, values };
  });
}

export function isDartConfigured() {
  return Boolean(DART_KEY);
}
