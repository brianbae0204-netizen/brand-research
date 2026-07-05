import { NextResponse } from "next/server";
import {
  getCompanyInfo,
  getFinancials,
  summarize,
  isDartConfigured,
} from "@/lib/dart";
import { getNews, getBlogs, getShopping, findHomepage, fetchHomepageText } from "@/lib/naver";
import { getEmploymentInfo } from "@/lib/publicdata";
import { extractInvestment } from "@/lib/investment";
import { research, extractBrand } from "@/lib/research";
import {
  isGeminiConfigured,
  geminiOverview,
  geminiFinancialAnalysis,
} from "@/lib/gemini";
import { scrapeFinancials } from "@/lib/webscrape";
import type {
  CompanyOverview, EmploymentInfo, FinancialAnalysis, FinancialSummaryRow,
  MetricSource, NewsItem,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Vercel 함수 실행 제한(초) — 외부 API 수집이 길어질 수 있어 상향

function latestRevenue(summary: FinancialSummaryRow[]) {
  if (!summary.length) return { value: null as number | null, year: null as number | null };
  const sorted = [...summary].sort((a, b) => b.year - a.year);
  for (const row of sorted) {
    const rev = row.values["매출액"];
    if (rev !== null && rev !== undefined) return { value: rev, year: row.year };
  }
  return { value: null, year: sorted[0]?.year ?? null };
}

function fmtBizrNo(no?: string): string | undefined {
  if (!no) return undefined;
  const d = no.replace(/\D/g, "");
  if (d.length !== 10) return no;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

function calcAge(est_dt?: string): number | null {
  if (!est_dt || est_dt.length < 8) return null;
  const y = Number(est_dt.slice(0, 4));
  const m = Number(est_dt.slice(4, 6));
  if (!y) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m) age -= 1;
  return age >= 0 ? age : null;
}

/** 재무분석 프롬프트용 요약 텍스트 */
function rowsToText(summary: FinancialSummaryRow[]): string {
  const sorted = [...summary].sort((a, b) => a.year - b.year);
  const keys = ["매출액", "영업이익", "당기순이익", "자산총계", "부채총계", "자본총계"];
  return sorted
    .map((r) => `${r.year}(${r.fs_div}): ` + keys.map((k) => `${k}=${r.values[k] ?? "N/A"}`).join(", "))
    .join("\n");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const corp_code = searchParams.get("corp_code") || "";
  const q = (searchParams.get("q") || "").trim();
  // 사용자가 직접 입력한 운영 브랜드 (콤마 구분) — AI 추정보다 우선
  const userBrandsRaw = (searchParams.get("brands") || "").trim();
  const userBrands = userBrandsRaw
    ? userBrandsRaw.split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 6)
    : [];
  if (!corp_code && !q) {
    return NextResponse.json({ error: "corp_code 또는 q 파라미터가 필요합니다." }, { status: 400 });
  }

  try {
    const info = corp_code && isDartConfigured() ? await getCompanyInfo(corp_code) : null;
    const baseName = info?.corp_name || q;
    const dartHmUrl = info?.hm_url && info.hm_url !== "-" ? info.hm_url : null;

    // 1차: 법인명 기준 — 회사명만으로는 무관 기사(정치/사회 등)가 섞이므로
    // "회사명 + 회사" 또는 "(주)회사명" 같은 modifier를 추가해 검색 정밀도 향상
    const corpQuery = baseName.startsWith("(주)") || baseName.includes("주식회사")
      ? baseName
      : `${baseName} 회사`;
    const [corpNewsRaw1, corpNewsRaw2, corpBlog, summary, employmentNps, dartHomepageText] = await Promise.all([
      getNews(corpQuery, 15).catch(() => [] as NewsItem[]),
      getNews(`(주)${baseName.replace(/^\(주\)/, "")}`, 10).catch(() => [] as NewsItem[]),
      getBlogs(`${baseName} 회사`, 12).catch(() => [] as NewsItem[]),
      corp_code && isDartConfigured()
        ? getFinancials(corp_code).then(summarize).catch(() => [] as FinancialSummaryRow[])
        : Promise.resolve([] as FinancialSummaryRow[]),
      getEmploymentInfo(baseName).catch(() => null),
      // 홈페이지 텍스트 크롤링 — DART URL 있으면 바로 시도
      dartHmUrl ? fetchHomepageText(dartHmUrl).catch(() => null) : Promise.resolve(null),
    ]);
    // 두 쿼리 결과 합치고 중복 제거 (회사 단위 뉴스 풀)
    const corpDedupe = new Map<string, NewsItem>();
    for (const n of [...corpNewsRaw1, ...corpNewsRaw2]) {
      const k = (n.url || "").split("?")[0];
      if (k && !corpDedupe.has(k)) corpDedupe.set(k, n);
    }
    const corpNews = [...corpDedupe.values()].slice(0, 25);

    // 운영 브랜드 감지 — 우선순위: 사용자 직접 입력 > Gemini AI 추정 > 휴리스틱
    const heuristicBrand = extractBrand(baseName, corpNews, corpBlog);
    const dartIdentifier = {
      stock_code: info?.stock_code,
      induty_code: info?.induty_code,
      homepage: info?.hm_url,
      ceo: info?.ceo_nm,
      est_dt: info?.est_dt,
    };
    // 홈페이지 텍스트: DART URL로 못 가져왔으면 네이버 웹문서로 추정 후 추가 시도
    const homepageGuessUrl = dartHmUrl ? null : await findHomepage(baseName).catch(() => null);
    const homepageText = dartHomepageText ||
      (homepageGuessUrl ? await fetchHomepageText(homepageGuessUrl).catch(() => null) : null);

    // 사용자 입력이 있으면 Gemini 호출 스킵 (quota 절약 + 정확성 보장)
    const gOvEarly = userBrands.length > 0
      ? null
      : await geminiOverview(baseName, dartIdentifier, heuristicBrand, corpNews, corpBlog, homepageText).catch(() => null);

    /** Gemini brands가 비었을 때 — intro 본문에서 brand-like 고유명사만 엄격 추출
     * 너무 헐거운 패턴은 정치·일반 단어까지 잡으므로 boundary 조건을 강화 */
    const fallbackBrandsFromText = (corpName: string, intro: string): string[] => {
      if (!intro) return [];
      // brand-like 토큰: 영문 포함 OR 한글 3자 이상 OR 영문대문자+숫자
      const tokenRe = /[A-Z][A-Za-z0-9]{2,}|[가-힣]{3,}[A-Za-z0-9]*|[가-힣]{2}[A-Za-z0-9]{2,}/g;
      const stop = new Set([
        "회사","법인","기업","해당","이번","최근","올해","지난해","글로벌","국내","해외",
        "아마존","제품","매출","영업","이익","증권가","화장품","뷰티","시장","고객",
        "미국","한국","일본","중국","유럽","일부","업종","배출량","강세","증가","호조",
        "확대","출시","라인업","시리즈","브랜드","디바이스","마스크","앰플","크림","선크림",
        "콜라겐","수출","수입","성장","규모","비중","현지","소비자","기업가치","주가",
        corpName.replace(/[()주식회사\s]/g, ""), "에이피알", "APR",
      ]);
      // 한국어 조사 제거: "메디큐브는"→"메디큐브", "에이피알의"→"에이피알"
      const stripJosa = (s: string): string => {
        return s.replace(/(은|는|이|가|을|를|의|와|과|도|만|로|으로|에서|에게|부터|까지|에)$/, "");
      };
      const counts = new Map<string, number>();
      let m: RegExpExecArray | null;
      while ((m = tokenRe.exec(intro)) !== null) {
        let tok = m[0];
        // 동사 어미가 붙은 토큰 배제
        if (/(했다|한다|된다|이다|있다|없다|관련|위해|통해|위한|대한|에서|으로)$/.test(tok)) continue;
        tok = stripJosa(tok);
        if (tok.length < 2) continue;
        if (stop.has(tok)) continue;
        counts.set(tok, (counts.get(tok) || 0) + 1);
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k)
        .slice(0, 4);
    };

    const brands: string[] = (() => {
      // 1순위: 사용자 직접 입력 (100% 신뢰)
      if (userBrands.length > 0) return userBrands;
      // 2순위: Gemini AI 추정
      const list = (gOvEarly?.brands || []).filter(Boolean).map((b) => b.trim());
      if (list.length > 0) return Array.from(new Set(list)).slice(0, 6);
      // 3순위: intro 후처리 추출
      const fromText = fallbackBrandsFromText(baseName, gOvEarly?.intro || "");
      if (fromText.length > 0) return fromText;
      // 4순위: 단일 휴리스틱
      if (heuristicBrand && heuristicBrand !== baseName) return [heuristicBrand];
      return [];
    })();
    const brand = brands[0] || null; // 대표 브랜드 (UI/하위 호환용)
    const searchName = brand || baseName;
    const useBrand = brands.length > 0;

    // 다중 브랜드 검색: 회사명 결과 + 각 브랜드별 결과 합치기 (중복 제거)
    const dedupeByUrl = <T extends { url: string }>(arr: T[]) => {
      const seen = new Set<string>();
      const out: T[] = [];
      for (const x of arr) {
        const k = (x.url || "").split("?")[0];
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(x);
      }
      return out;
    };

    const brandNewsLists = useBrand
      ? await Promise.all(brands.map((b) => getNews(b, 10).catch(() => [] as NewsItem[])))
      : [];
    const brandBlogLists = useBrand
      ? await Promise.all(brands.map((b) => getBlogs(b, 6).catch(() => [] as NewsItem[])))
      : [];
    const brandShopLists = useBrand
      ? await Promise.all(brands.map((b) => getShopping(b, 8).catch(() => [])))
      : [await getShopping(baseName, 12).catch(() => [])];

    const brandNewsRaw = useBrand
      ? dedupeByUrl([...brandNewsLists.flat(), ...corpNews]).slice(0, 30)
      : corpNews;
    const brandBlogRaw = useBrand
      ? dedupeByUrl([...brandBlogLists.flat(), ...corpBlog]).slice(0, 20)
      : corpBlog;
    const shopping = dedupeByUrl(brandShopLists.flat()).slice(0, 12);
    const homepageGuess = homepageGuessUrl || await findHomepage(searchName).catch(() => null);

    // 뉴스 연관성 검증 — 다중 브랜드 키워드 매칭 (Gemini 미사용: quota 절약)
    // 회사명 또는 운영 브랜드 중 하나라도 포함하는 기사만 통과
    const allKeywords = [baseName, ...brands].filter(Boolean);
    const matchAny = (item: NewsItem) => {
      const blob = `${item.title} ${item.desc}`.toLowerCase();
      return allKeywords.some((k) => blob.includes(k.toLowerCase()));
    };
    const filterRelevant = (raw: NewsItem[]) => {
      const matched = raw.filter(matchAny);
      return matched.length > 0 ? matched : raw;
    };
    const relevantNews = filterRelevant(brandNewsRaw);
    const relevantBlog = filterRelevant(brandBlogRaw);

    // 기업개요: Gemini 통합 호출은 이미 위에서 1회 실행됨(gOvEarly) — 재호출하지 않음(quota 절약)
    const brandR = research(searchName, relevantNews, relevantBlog, shopping);
    const corpR = research(baseName, corpNews, corpBlog, []); // 법인 단위 고용/매출
    const gOv = gOvEarly;

    const intro = gOv?.intro || brandR.intro;
    const introSource: MetricSource = gOv
      ? { source: "AI 요약 (Groq/Gemini)", confidence: "estimated", verifyUrl: brandR.introSource.verifyUrl, note: "AI 생성 — 발췌 근거 기반, 검증 필요." }
      : brandR.introSource;
    const businessArea = gOv?.businessArea || brandR.businessArea;
    const products = (gOv?.products && gOv.products.length > 0 ? gOv.products : brandR.products).slice(0, 6);

    // 투자
    const investment = (await extractInvestment(baseName, corpNews).catch(() => null)) ?? {
      stage: null, totalAmount: null, dealCount: 0, evidence: [],
      source: { source: "네이버 뉴스 추정", confidence: "unknown" as const },
    };

    // 고용인원: 국민연금 우선 → 기사 추출
    let employment: EmploymentInfo;
    if (employmentNps && employmentNps.headcount !== null) employment = employmentNps;
    else if (corpR.headcount !== null) employment = { headcount: corpR.headcount, source: corpR.headcountSource };
    else employment = employmentNps ?? { headcount: null, source: { source: "국민연금/기사", confidence: "unknown" } };

    // 매출: DART 우선 → 웹 크롤링 → 뉴스 폴백
    const dartRev = latestRevenue(summary);
    let webScraped: Awaited<ReturnType<typeof scrapeFinancials>> = null;
    if (dartRev.value === null) {
      // DART에 재무 데이터가 없을 때만 웹 크롤링 시도 (속도 절약)
      webScraped = await scrapeFinancials(baseName).catch(() => null);
      // 웹 크롤링 결과를 summary에 병합 (재무표·차트에서 활용)
      if (webScraped && webScraped.rows.length > 0) {
        summary.push(...webScraped.rows);
      }
    }
    const webRev = webScraped ? latestRevenue(webScraped.rows) : { value: null, year: null };

    let revenue: { value: number | null; year: number | null; source: MetricSource };
    if (dartRev.value !== null) {
      revenue = {
        value: dartRev.value, year: dartRev.year,
        source: { source: "DART 재무제표", confidence: "confirmed", verifyUrl: `https://dart.fss.or.kr/dsab007/main.do?textCrpNm=${encodeURIComponent(baseName)}` },
      };
    } else if (webRev.value !== null) {
      revenue = {
        value: webRev.value, year: webRev.year,
        source: {
          source: `웹 크롤링 (${webScraped!.sourceUrl.replace(/^https?:\/\/([^/]+).*/, "$1")})`,
          confidence: "estimated",
          verifyUrl: webScraped!.sourceUrl,
          note: webScraped!.note,
        },
      };
    } else if (corpR.revenue.value !== null) {
      revenue = { value: corpR.revenue.value, year: corpR.revenue.year, source: corpR.revenueSource };
    } else {
      revenue = { value: null, year: dartRev.year, source: { source: "DART 재무제표", confidence: "unknown", note: "공시·크롤링·기사 모두에서 매출을 찾지 못했습니다." } };
    }

    // 홈페이지
    const dartUrl = info?.hm_url && info.hm_url !== "-" ? info.hm_url : "";
    const homepage = dartUrl
      ? { url: dartUrl, source: { source: "DART", confidence: "confirmed" as const } }
      : homepageGuess
      ? { url: homepageGuess, source: { source: "웹문서 검색 추정", confidence: "estimated" as const, note: "검색 상위 비포털 도메인 — 공식 여부 확인 필요." } }
      : { url: null, source: { source: "검색", confidence: "unknown" as const } };

    // 재무 분석 (Gemini)
    let financialAnalysis: FinancialAnalysis | null = null;
    if (summary.length > 0) {
      const analysis = await geminiFinancialAnalysis(baseName, rowsToText(summary)).catch(() => null);
      if (analysis) {
        financialAnalysis = {
          text: analysis,
          source: { source: "AI 분석 (Groq/Gemini)", confidence: "estimated", note: "AI 해석 — 투자판단 아님, 검증 필요." },
        };
      }
    }

    const keywords = Array.from(new Set([
      brand || "",
      investment.stage ? "투자유치" : "",
      info?.stock_code ? "상장사" : "비상장",
    ].filter(Boolean)));

    const overview: CompanyOverview = {
      corp_name: baseName,
      corp_name_eng: info?.corp_name_eng,
      intro,
      introSource,
      introReview: gOv?.review || null,
      businessArea,
      products,
      businessSource: gOv
        ? { source: "AI (Groq/Gemini)", confidence: "estimated" }
        : brandR.businessSource,
      keywords,
      brand: brand || null,
      ceo_nm: info?.ceo_nm,
      bizr_no: fmtBizrNo(info?.bizr_no),
      adres: info?.adres,
      est_dt: info?.est_dt,
      ageYears: calcAge(info?.est_dt),
      is_listed: Boolean(info?.stock_code),
      stock_code: info?.stock_code,
      induty_code: info?.induty_code,
      homepage,
      employment,
      investment,
      latestRevenue: revenue,
    };

    return NextResponse.json({
      info,
      summary,
      overview,
      brand: brand || null,
      brands,
      brandsNote: gOv?.review || null,
      aiEnabled: isGeminiConfigured(),
      news: relevantNews.slice(0, 8),
      blog: relevantBlog.slice(0, 6),
      shopping,
      financialAnalysis,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
