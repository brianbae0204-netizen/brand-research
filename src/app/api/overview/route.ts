import { NextResponse } from "next/server";
import {
  getCompanyInfo,
  getFinancials,
  summarize,
  isDartConfigured,
} from "@/lib/dart";
import { getNews, getBlogs, getShopping, findHomepage } from "@/lib/naver";
import { getEmploymentInfo } from "@/lib/publicdata";
import { extractInvestment } from "@/lib/investment";
import { research, extractBrand, keywordRelevantNews } from "@/lib/research";
import {
  isGeminiConfigured,
  geminiOverview,
  geminiRelevantNews,
  geminiFinancialAnalysis,
} from "@/lib/gemini";
import type {
  CompanyOverview, EmploymentInfo, FinancialAnalysis, FinancialSummaryRow,
  MetricSource, NewsItem,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  if (!corp_code && !q) {
    return NextResponse.json({ error: "corp_code 또는 q 파라미터가 필요합니다." }, { status: 400 });
  }

  try {
    const info = corp_code && isDartConfigured() ? await getCompanyInfo(corp_code) : null;
    const baseName = info?.corp_name || q;

    // 1차: 법인명 기준 (브랜드 감지 + 법인 단위 수치/투자)
    const [corpNews, corpBlog, summary, employmentNps] = await Promise.all([
      getNews(baseName, 25).catch(() => [] as NewsItem[]),
      getBlogs(baseName, 12).catch(() => [] as NewsItem[]),
      corp_code && isDartConfigured()
        ? getFinancials(corp_code).then(summarize).catch(() => [] as FinancialSummaryRow[])
        : Promise.resolve([] as FinancialSummaryRow[]),
      getEmploymentInfo(baseName).catch(() => null),
    ]);

    // 운영 브랜드 감지 → 브랜드 기준으로 뉴스/쇼핑/블로그 재검색
    const brand = extractBrand(baseName, corpNews, corpBlog);
    const searchName = brand || baseName;
    const useBrand = Boolean(brand && brand !== baseName);

    const [brandNewsRaw, brandBlogRaw, shopping, homepageGuess] = await Promise.all([
      useBrand ? getNews(searchName, 15).catch(() => corpNews) : Promise.resolve(corpNews),
      useBrand ? getBlogs(searchName, 10).catch(() => corpBlog) : Promise.resolve(corpBlog),
      getShopping(searchName, 12).catch(() => []),
      findHomepage(searchName).catch(() => null),
    ]);

    // 뉴스 연관성 검증 (Gemini → 폴백 키워드)
    let relevantNews: NewsItem[];
    const gIdx = await geminiRelevantNews(baseName, brand, brandNewsRaw).catch(() => null);
    if (gIdx && gIdx.length > 0) {
      relevantNews = gIdx.map((i) => brandNewsRaw[i]).filter(Boolean);
    } else {
      const kw = keywordRelevantNews(baseName, brand, brandNewsRaw);
      relevantNews = kw.length > 0 ? kw : brandNewsRaw;
    }
    const relevantBlog = (() => {
      const kw = keywordRelevantNews(baseName, brand, brandBlogRaw);
      return kw.length > 0 ? kw : brandBlogRaw;
    })();

    // 기업개요: Gemini 작성+검수 → 폴백 발췌요약
    const brandR = research(searchName, relevantNews, relevantBlog, shopping);
    const corpR = research(baseName, corpNews, corpBlog, []); // 법인 단위 고용/매출
    const gOv = await geminiOverview(baseName, brand, relevantNews, relevantBlog).catch(() => null);

    const intro = gOv?.intro || brandR.intro;
    const introSource: MetricSource = gOv
      ? { source: "Gemini AI 요약", confidence: "estimated", verifyUrl: brandR.introSource.verifyUrl, note: "AI 생성 — 발췌 근거 기반, 검증 필요." }
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

    // 매출: DART 우선 → 기사 폴백
    const dartRev = latestRevenue(summary);
    let revenue: { value: number | null; year: number | null; source: MetricSource };
    if (dartRev.value !== null) {
      revenue = {
        value: dartRev.value, year: dartRev.year,
        source: { source: "DART 재무제표", confidence: "confirmed", verifyUrl: `https://dart.fss.or.kr/dsab007/main.do?textCrpNm=${encodeURIComponent(baseName)}` },
      };
    } else if (corpR.revenue.value !== null) {
      revenue = { value: corpR.revenue.value, year: corpR.revenue.year, source: corpR.revenueSource };
    } else {
      revenue = { value: null, year: dartRev.year, source: { source: "DART 재무제표", confidence: "unknown", note: "공시·기사에서 매출을 찾지 못했습니다." } };
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
          source: { source: "Gemini AI 분석", confidence: "estimated", note: "AI 해석 — 투자판단 아님, 검증 필요." },
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
        ? { source: "Gemini AI", confidence: "estimated" }
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
      aiEnabled: isGeminiConfigured(),
      news: relevantNews.slice(0, 8),
      blog: relevantBlog.slice(0, 6),
      shopping,
      financialAnalysis,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
