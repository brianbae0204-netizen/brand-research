/**
 * 웹 크롤링 기반 재무 데이터 수집
 * DART 미공시(비상장·소규모 외감 미대상) 기업을 위한 폴백
 *
 * 수집 소스 (우선순위 순):
 *  1. 크레딧잡 (creditjob.co.kr) — 외감 기업 재무 데이터 집계
 *  2. 혁신의숲 (innoforest.co.kr) — 스타트업 재무 지표
 *  3. 네이버 웹문서 검색 — 법인명+재무 관련 기사/공시 페이지
 *  4. 네이버 뉴스 스니펫 — 기사에서 재무 수치 직접 추출
 *
 * ⚠️ 결과는 추정치이며 반드시 원문 검증이 필요합니다.
 */

import type { FinancialSummaryRow } from "./types";

const NAVER_ID = process.env.NAVER_CLIENT_ID?.trim() || "";
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET?.trim() || "";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

/** HTML → 순수 텍스트 변환 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#[0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 한국어 금액 문자열 → 원 단위 숫자 변환
 *  지원: 조, 억, 천만, 백만, 만, 천원, 원, 백만원(숫자만) */
function parseKoreanAmount(raw: string): number | null {
  const s = raw.replace(/,/g, "").replace(/\s/g, "").trim();
  // 음수 처리 — 영업손실 등
  const neg = s.startsWith("-") || s.startsWith("▼") || s.startsWith("△");
  const abs = s.replace(/^[-▼△]/, "");

  let val: number | null = null;

  // 1조 2,345억 복합
  const joOk = abs.match(/^([0-9.]+)조([0-9.]+)억/);
  if (joOk) val = Number(joOk[1]) * 1e12 + Number(joOk[2]) * 1e8;

  // X조
  if (!val) { const m = abs.match(/^([0-9.]+)조/); if (m) val = Number(m[1]) * 1e12; }
  // X억
  if (!val) { const m = abs.match(/^([0-9.]+)억/); if (m) val = Number(m[1]) * 1e8; }
  // X천만
  if (!val) { const m = abs.match(/^([0-9.]+)천만/); if (m) val = Number(m[1]) * 1e7; }
  // X백만
  if (!val) { const m = abs.match(/^([0-9.]+)백만/); if (m) val = Number(m[1]) * 1e6; }
  // X만
  if (!val) { const m = abs.match(/^([0-9.]+)만/); if (m) val = Number(m[1]) * 1e4; }
  // 숫자만 (재무표 백만원 단위 추정 — 100 이상 ~ 1조 미만)
  if (!val) {
    const m = abs.match(/^([0-9]+)$/);
    if (m) {
      const n = Number(m[1]);
      // 10만 이상 1조 미만: 백만원 단위 (DART·재무표 표준)
      if (n >= 100_000 && n < 1_000_000_000_000) val = n * 1e6;
      // 100~99999: 억원 단위 가능성
      else if (n >= 100 && n < 100_000) val = n * 1e8;
    }
  }

  if (val === null || !Number.isFinite(val)) return null;
  // 비정상값 필터 (1원 이하 또는 1000조 초과)
  if (val <= 0 || val > 1e15) return null;
  return neg ? -val : val;
}

// 연도 추출 패턴
const YEAR_RE = /20(2[0-9])\s*년?/g;

function extractYearNearIndex(text: string, idx: number): number | null {
  YEAR_RE.lastIndex = 0;
  let best: { year: number; dist: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = YEAR_RE.exec(text)) !== null) {
    const dist = Math.abs(m.index - idx);
    if (dist < 120 && (!best || dist < best.dist)) {
      best = { year: 2000 + Number(m[1]), dist };
    }
  }
  return best ? best.year : null;
}

/** 재무 항목별 정규식 패턴 */
const FIN_PATTERNS: Record<string, RegExp[]> = {
  매출액: [
    /매출액\s*[:\s·|]\s*([-▼△]?[0-9,조억천만백만원\s]+)/g,
    /수익\(매출액\)\s*[:\s]\s*([-▼△]?[0-9,조억천만백만원\s]+)/g,
    /영업수익\s*[:\s]\s*([-▼△]?[0-9,조억천만백만원\s]+)/g,
  ],
  영업이익: [
    /영업이익\s*[:\s·|]\s*([-▼△]?[0-9,조억천만백만원\s]+)/g,
    /영업이익\(손실\)\s*[:\s]\s*([-▼△]?[0-9,조억천만백만원\s]+)/g,
  ],
  당기순이익: [
    /당기순이익\s*[:\s·|]\s*([-▼△]?[0-9,조억천만백만원\s]+)/g,
    /당기순이익\(손실\)\s*[:\s]\s*([-▼△]?[0-9,조억천만백만원\s]+)/g,
    /순이익\s*[:\s·|]\s*([-▼△]?[0-9,조억천만백만원\s]+)/g,
  ],
};

interface ParsedRow {
  values: Record<string, number | null>;
  year: number | null;
  sourceUrl: string;
}

/** 텍스트에서 재무 수치 추출 */
function parseFinancialsFromText(text: string, sourceUrl: string): ParsedRow | null {
  const values: Record<string, number | null> = {};
  let guessYear: number | null = null;

  for (const [key, patterns] of Object.entries(FIN_PATTERNS)) {
    for (const re of patterns) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (!m) continue;
      const raw = m[1].replace(/\s/g, "").slice(0, 20);
      const val = parseKoreanAmount(raw);
      if (val !== null) {
        values[key] = val;
        if (!guessYear) guessYear = extractYearNearIndex(text, m.index);
        break;
      }
    }
  }

  // 유효 항목이 1개 이상이어야 반환
  const found = Object.values(values).filter((v) => v !== null).length;
  if (found === 0) return null;

  // 연도가 없으면 전년도로 추정 (DART 공시 주기상 가장 최근 확정치)
  if (!guessYear) {
    const currentYear = new Date().getFullYear();
    guessYear = currentYear - 1;
  }

  return { values, year: guessYear, sourceUrl };
}

/** Naver 검색 API 호출 */
async function naverSearch(
  kind: "webkr" | "news",
  query: string,
  display = 10
): Promise<{ title: string; description: string; link: string }[]> {
  if (!NAVER_ID || !NAVER_SECRET) return [];
  try {
    const url = `https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(query)}&display=${display}`;
    const res = await fetch(url, {
      headers: { "X-Naver-Client-Id": NAVER_ID, "X-Naver-Client-Secret": NAVER_SECRET },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.items || []).map((x: any) => ({
      title: (x.title || "").replace(/<[^>]+>/g, ""),
      description: (x.description || "").replace(/<[^>]+>/g, ""),
      link: x.originallink || x.link || "",
    }));
  } catch {
    return [];
  }
}

/** URL 페이지 fetch (타임아웃 7초) */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("text")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** 크레딧잡 검색 → 재무 데이터 추출 */
async function tryCreditJob(corpName: string): Promise<ParsedRow | null> {
  const searchUrl = `https://www.creditjob.co.kr/company/search?keyword=${encodeURIComponent(corpName)}`;
  const html = await fetchPage(searchUrl);
  if (!html) return null;
  const text = htmlToText(html);
  // 회사명이 결과에 있는지 확인
  if (!text.includes(corpName.replace(/\(주\)|주식회사/g, "").trim())) return null;

  // 검색 결과 페이지에 재무 데이터가 있으면 직접 파싱
  const row = parseFinancialsFromText(text, searchUrl);
  if (row) return row;

  // 회사 상세 페이지 링크 추출
  const idMatch = html.match(/href=["']\/company\/([0-9]+)["']/);
  if (!idMatch) return null;
  const detailUrl = `https://www.creditjob.co.kr/company/${idMatch[1]}`;
  const detailHtml = await fetchPage(detailUrl);
  if (!detailHtml) return null;
  return parseFinancialsFromText(htmlToText(detailHtml), detailUrl);
}

/** 혁신의숲 검색 → 재무 데이터 추출 */
async function tryInnoforest(corpName: string): Promise<ParsedRow | null> {
  const searchUrl = `https://www.innoforest.co.kr/search?keyword=${encodeURIComponent(corpName)}`;
  const html = await fetchPage(searchUrl);
  if (!html) return null;
  const text = htmlToText(html);
  const row = parseFinancialsFromText(text, searchUrl);
  if (row) return row;

  // 상세 페이지 링크 추출
  const idMatch = html.match(/href=["']\/company\/([0-9]+)/);
  if (!idMatch) return null;
  const detailUrl = `https://www.innoforest.co.kr/company/${idMatch[1]}/summary`;
  const detailHtml = await fetchPage(detailUrl);
  if (!detailHtml) return null;
  return parseFinancialsFromText(htmlToText(detailHtml), detailUrl);
}

/** 네이버 웹문서 검색 → 재무 데이터 페이지 크롤링 */
async function tryNaverWebFinancial(corpName: string): Promise<ParsedRow | null> {
  // 재무 특화 검색어
  const queries = [
    `"${corpName}" 매출액 영업이익 당기순이익`,
    `${corpName} 재무현황 매출 영업이익`,
  ];

  // 재무 데이터를 가질 가능성 높은 도메인 우선
  const FINANCIAL_DOMAINS = [
    "creditjob.co.kr",
    "innoforest.co.kr",
    "thevc.kr",
    "catch.co.kr",
    "jobplanet.co.kr",
    "fnguide.com",
    "kisline.com",
    "dart.fss.or.kr",
    "sminfo.mss.go.kr",
  ];

  for (const q of queries) {
    const results = await naverSearch("webkr", q, 10);
    // 재무 사이트 우선, 나머지는 뒤로
    const sorted = [...results].sort((a, b) => {
      const aScore = FINANCIAL_DOMAINS.some((d) => a.link.includes(d)) ? 1 : 0;
      const bScore = FINANCIAL_DOMAINS.some((d) => b.link.includes(d)) ? 1 : 0;
      return bScore - aScore;
    });

    for (const item of sorted.slice(0, 5)) {
      if (!item.link) continue;
      // 스니펫만으로도 파싱 시도 (네트워크 절약)
      const snippetText = `${item.title} ${item.description}`;
      const snippetRow = parseFinancialsFromText(snippetText, item.link);
      if (snippetRow && Object.values(snippetRow.values).filter(Boolean).length >= 2) {
        return snippetRow;
      }
      // 스니펫 부족 시 페이지 fetch
      const html = await fetchPage(item.link);
      if (!html) continue;
      const row = parseFinancialsFromText(htmlToText(html), item.link);
      if (row) return row;
    }
  }
  return null;
}

/** 네이버 뉴스 스니펫에서 재무 수치 추출 */
async function tryNaverNewsFinancial(corpName: string): Promise<ParsedRow | null> {
  const queries = [
    `${corpName} 매출액 영업이익`,
    `${corpName} 연간 매출 실적`,
    `${corpName} 재무결과`,
  ];

  for (const q of queries) {
    const items = await naverSearch("news", q, 15);
    for (const item of items) {
      const text = `${item.title} ${item.description}`;
      // 회사명 언급 확인
      const cn = corpName.replace(/\(주\)|주식회사|㈜/g, "").trim();
      if (!text.includes(cn)) continue;
      const row = parseFinancialsFromText(text, item.link);
      if (row && Object.values(row.values).filter(Boolean).length >= 1) return row;
    }
  }
  return null;
}

/** ParsedRow → FinancialSummaryRow 변환 */
function toSummaryRow(row: ParsedRow): FinancialSummaryRow {
  const values: Record<string, number | null> = {
    매출액: row.values["매출액"] ?? null,
    매출원가: null,
    매출총이익: null,
    영업이익: row.values["영업이익"] ?? null,
    법인세차감전순이익: null,
    당기순이익: row.values["당기순이익"] ?? null,
    자산총계: null,
    부채총계: null,
    자본총계: null,
    현금성자산: null,
    재고자산: null,
    매출채권: null,
    단기차입금: null,
    장기차입금: null,
    영업활동현금흐름: null,
    투자활동현금흐름: null,
    재무활동현금흐름: null,
  };
  return {
    year: row.year ?? new Date().getFullYear() - 1,
    fs_div: "WEB", // 웹 크롤링 출처 구분
    values,
  };
}

export interface WebScrapedFinancials {
  rows: FinancialSummaryRow[];
  sourceUrl: string;
  note: string;
}

/**
 * 메인 진입점 — DART 미공시 기업의 재무 데이터를 웹에서 수집
 * @param corpName  법인명 (DART 정식 표기 또는 브랜드명)
 */
export async function scrapeFinancials(
  corpName: string
): Promise<WebScrapedFinancials | null> {
  // 여러 소스를 병렬로 시도 (첫 성공 결과 반환)
  const results = await Promise.all([
    tryCreditJob(corpName).catch(() => null),
    tryInnoforest(corpName).catch(() => null),
    tryNaverWebFinancial(corpName).catch(() => null),
    tryNaverNewsFinancial(corpName).catch(() => null),
  ]);

  for (const row of results) {
    if (!row) continue;
    // 최소 1개 이상의 재무 수치가 있어야 유효
    const valid = Object.values(row.values).filter((v) => v !== null).length;
    if (valid < 1) continue;
    return {
      rows: [toSummaryRow(row)],
      sourceUrl: row.sourceUrl,
      note: `웹 크롤링 추정 (${row.sourceUrl.replace(/^https?:\/\/([^/]+).*/, "$1")}) — DART 미공시 기업, 검증 필요`,
    };
  }

  return null;
}
