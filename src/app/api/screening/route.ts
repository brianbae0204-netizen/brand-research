import { NextResponse } from "next/server";
import { getCompanyInfo, getFinancials, summarize, isDartConfigured } from "@/lib/dart";
import { getNews, getBlogs, getShopping } from "@/lib/naver";
import { extractBrand } from "@/lib/research";
import { isGeminiConfigured, geminiScreening, type GeminiScreening } from "@/lib/gemini";
import type {
  FinancialSummaryRow, MetricSource, NewsItem, ScreeningCategory,
  ScreeningField, ScreeningResult, ShoppingItem,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Vercel 함수 실행 제한(초) — 외부 API 수집이 길어질 수 있어 상향

const NO_INFO = "정보 없음 / 실사 필요";

const SRC = {
  dart: (name: string): MetricSource => ({
    source: "DART",
    confidence: "confirmed",
    verifyUrl: `https://dart.fss.or.kr/dsab007/main.do?textCrpNm=${encodeURIComponent(name)}`,
  }),
  calc: { source: "DART 기반 계산", confidence: "confirmed" } as MetricSource,
  naver: { source: "네이버 쇼핑", confidence: "confirmed" } as MetricSource,
  sample: { source: "네이버 쇼핑 표본", confidence: "estimated", note: "노출 상품 표본 기준 추정." } as MetricSource,
};

function won(v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(1)}조원`;
  if (a >= 1e8) return `${Math.round(v / 1e8).toLocaleString()}억원`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`;
  return `${v.toLocaleString()}원`;
}

function fmtDate(d?: string) {
  if (!d || d.length < 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
function age(d?: string) {
  if (!d || d.length < 8) return null;
  const y = Number(d.slice(0, 4));
  if (!y) return null;
  return new Date().getFullYear() - y;
}

/** 확정값 필드 (값 없으면 NO_INFO/unknown) */
function field(label: string, value: string | null, source: MetricSource): ScreeningField {
  const ok = value !== null && value !== "" && value !== "-";
  return {
    label,
    value: ok ? value! : NO_INFO,
    source: ok ? source : { source: source.source, confidence: "unknown" },
  };
}

/** Gemini soft 필드 → ScreeningField */
function soft(label: string, raw: string | undefined): ScreeningField {
  const v = (raw || "").trim();
  const isInfo = v && !v.includes("정보 없음");
  return {
    label,
    value: isInfo ? v : NO_INFO,
    source: {
      source: "AI (Groq/Gemini)",
      confidence: isInfo ? "estimated" : "unknown",
      note: isInfo ? "AI 추정 — 검증 필요." : undefined,
    },
  };
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

    const [news, blog, summaryRaw] = await Promise.all([
      getNews(baseName, 20).catch(() => [] as NewsItem[]),
      getBlogs(baseName, 10).catch(() => [] as NewsItem[]),
      corp_code && isDartConfigured()
        ? getFinancials(corp_code).then(summarize).catch(() => [] as FinancialSummaryRow[])
        : Promise.resolve([] as FinancialSummaryRow[]),
    ]);
    const brand = extractBrand(baseName, news, blog);
    const searchName = brand || baseName;
    const shopping = await getShopping(searchName, 20).catch(() => [] as ShoppingItem[]);

    const summary = [...summaryRaw].sort((a, b) => a.year - b.year);
    const latest = summary[summary.length - 1];
    const prev = summary.length > 1 ? summary[summary.length - 2] : null;
    const v = (row: FinancialSummaryRow | null | undefined, k: string) => (row ? row.values[k] ?? null : null);

    // ── C2 재무 계산 ──
    const rev3 = summary.map((r) => `${r.year} ${won(r.values["매출액"]) ?? "-"}`).join(" / ");
    const revLatest = v(latest, "매출액");
    const revPrev = v(prev, "매출액");
    const revGrowth = revLatest !== null && revPrev ? ((revLatest - revPrev) / Math.abs(revPrev)) * 100 : null;
    const op = v(latest, "영업이익");
    const opMargin = op !== null && revLatest ? (op / revLatest) * 100 : null;
    const gp = v(latest, "매출총이익");
    const cogs = v(latest, "매출원가");
    const grossMargin = revLatest
      ? gp !== null ? (gp / revLatest) * 100 : cogs !== null ? ((revLatest - cogs) / revLatest) * 100 : null
      : null;
    const liab = v(latest, "부채총계");
    const equity = v(latest, "자본총계");
    const debtRatio = liab !== null && equity ? (liab / equity) * 100 : null;
    const inv = v(latest, "재고자산");
    const invTurnover = inv && (cogs !== null || revLatest !== null) ? ((cogs ?? revLatest)! / inv) : null;
    const borrow = (v(latest, "단기차입금") ?? 0) + (v(latest, "장기차입금") ?? 0);

    // ── C3 제품/가격 (네이버 쇼핑) ──
    const prices = shopping.map((s) => s.price).filter((p) => p > 0).sort((a, b) => a - b);
    const priceRange = prices.length
      ? `${prices[0].toLocaleString()}~${prices[prices.length - 1].toLocaleString()}원 (표본 ${prices.length})`
      : null;
    const productList = shopping.slice(0, 6).map((s) => s.title.replace(/<[^>]+>/g, "").slice(0, 30)).join(" · ") || null;
    const cats = Array.from(new Set(shopping.map((s) => s.category).filter(Boolean))).slice(0, 5).join(", ") || null;
    // 판매처 분포
    const mallCount = new Map<string, number>();
    shopping.forEach((s) => s.mall && mallCount.set(s.mall, (mallCount.get(s.mall) || 0) + 1));
    const topMalls = [...mallCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([m, c]) => `${m}(${c})`).join(", ") || null;

    // ── Gemini 컨텍스트 ──
    const context = [
      `[기업] 법인명:${baseName} / 사업자번호:${info?.bizr_no ?? "?"} / 설립:${fmtDate(info?.est_dt) ?? "?"} / 대표:${info?.ceo_nm ?? "?"} / 소재지:${info?.adres ?? "?"} / 상장:${info?.stock_code ? "상장" : "비상장"} / 브랜드:${brand ?? "?"}`,
      `[재무3개년] ${summary.map((r) => `${r.year}: 매출=${r.values["매출액"] ?? "N/A"}, 영업이익=${r.values["영업이익"] ?? "N/A"}, 순이익=${r.values["당기순이익"] ?? "N/A"}, 부채총계=${r.values["부채총계"] ?? "N/A"}, 자본총계=${r.values["자본총계"] ?? "N/A"}`).join(" | ") || "공시 없음"}`,
      `[제품/가격] ${productList ?? "없음"} | 가격대:${priceRange ?? "없음"} | 카테고리:${cats ?? "없음"} | 판매처:${topMalls ?? "없음"}`,
      `[뉴스발췌] ${[...news, ...blog].slice(0, 14).map((n) => `${n.title} :: ${n.desc}`).join(" / ")}`,
    ].join("\n");

    let g: GeminiScreening | null = null;
    if (summary.length || news.length || shopping.length) {
      g = await geminiScreening(baseName, brand, context).catch(() => null);
    }
    const dartSrc = SRC.dart(baseName);

    const categories: ScreeningCategory[] = [
      {
        id: "entity", title: "법인 실체", emoji: "🏢",
        fields: [
          field("법인명", info?.corp_name ?? baseName, dartSrc),
          field("사업자등록번호", info?.bizr_no ?? null, dartSrc),
          field("설립일 / 업력", info?.est_dt ? `${fmtDate(info.est_dt)} (업력 ${age(info.est_dt)}년)` : null, dartSrc),
          field("소재지", info?.adres ?? null, dartSrc),
          field("대표자", info?.ceo_nm ?? null, dartSrc),
          field("상장 여부", info ? (info.stock_code ? `상장 (${info.stock_code})` : "비상장") : null, dartSrc),
          soft("등기임원", g?.c1?.["등기임원"]),
          soft("대표 이력", g?.c1?.["대표이력"]),
          soft("자본금", g?.c1?.["자본금"]),
          soft("주주구성·지분율", g?.c1?.["주주구성_지분율"]),
          soft("관계사/모자회사 구조", g?.c1?.["관계사_모자회사"]),
          soft("화장품책임판매업 등록", g?.c1?.["화장품책임판매업등록"]),
        ],
      },
      {
        id: "finance", title: "재무", emoji: "💰",
        fields: [
          field("최근 매출(3개년)", rev3 || null, SRC.calc),
          field("매출 성장률(YoY)", revGrowth !== null ? `${revGrowth.toFixed(1)}%` : null, SRC.calc),
          field("영업이익 / 영업이익률", op !== null ? `${won(op)}${opMargin !== null ? ` (OPM ${opMargin.toFixed(1)}%)` : ""}` : null, SRC.calc),
          field("매출총이익률", grossMargin !== null ? `${grossMargin.toFixed(1)}%` : null, SRC.calc),
          field("당기순이익", won(v(latest, "당기순이익")), SRC.calc),
          field("부채비율", debtRatio !== null ? `${debtRatio.toFixed(1)}%` : null, SRC.calc),
          field("차입금", borrow > 0 ? won(borrow) : null, SRC.calc),
          field("현금성자산", won(v(latest, "현금성자산")), SRC.calc),
          field("영업활동 현금흐름", won(v(latest, "영업활동현금흐름")), SRC.calc),
          field("재고자산 회전율", invTurnover !== null ? `${invTurnover.toFixed(1)}회` : null, SRC.calc),
          field("매출채권", won(v(latest, "매출채권")), SRC.calc),
        ],
      },
      {
        id: "product", title: "브랜드·제품", emoji: "🧴",
        fields: [
          field("제품 포트폴리오", productList, SRC.naver),
          field("카테고리", cats, SRC.naver),
          field("가격대 포지셔닝", priceRange, SRC.naver),
          soft("매출 집중도(히어로 SKU)", g?.c3?.["매출집중도_히어로SKU"]),
          soft("재구매율·정기배송 비중", g?.c3?.["재구매율_정기배송비중"]),
          soft("제조 구조(자체/ODM·OEM)", g?.c3?.["제조구조_자체_ODM_OEM"]),
        ],
      },
      {
        id: "channel", title: "유통·채널", emoji: "🚚",
        fields: [
          field("주요 판매처(노출 표본)", topMalls, SRC.sample),
          soft("온/오프라인 비중", g?.c4?.["온오프라인_비중"]),
          soft("자사몰 vs 외부플랫폼", g?.c4?.["자사몰_vs_외부플랫폼"]),
          soft("주요 채널 의존도", g?.c4?.["주요채널_의존도"]),
          soft("국내/해외 비중·진출 방식", g?.c4?.["국내_해외비중_진출방식"]),
        ],
      },
      {
        id: "power", title: "브랜드 파워", emoji: "📣",
        fields: [
          field("온라인 언급(블로그 표본)", blog.length ? `네이버 블로그 ${blog.length}건+ 노출` : null, SRC.sample),
          soft("SNS 팔로워·추세", g?.c5?.["SNS팔로워_추세"]),
          soft("리뷰 수·평점·검색량", g?.c5?.["리뷰수_평점_검색량"]),
          soft("광고·인플루언서 의존도·CAC", g?.c5?.["광고_인플루언서_CAC"]),
        ],
      },
      {
        id: "legal", title: "법적·규제·IP", emoji: "⚖️",
        fields: [
          soft("상표권 등록 현황", g?.c6?.["상표권_등록현황"]),
          soft("특허·디자인권", g?.c6?.["특허_디자인권"]),
          soft("행정처분·리콜·표시광고 위반", g?.c6?.["행정처분_리콜_표시광고위반"]),
          soft("소송·채무보증·가압류", g?.c6?.["소송_채무보증_가압류"]),
        ],
      },
    ];

    const result: ScreeningResult = {
      corp_name: baseName,
      brand: brand || null,
      aiEnabled: isGeminiConfigured(),
      categories,
    };
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
