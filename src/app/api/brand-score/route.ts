import { NextResponse } from "next/server";
import { getFinancials, summarize, isDartConfigured } from "@/lib/dart";
import { getNews, getBlogs, getShopping } from "@/lib/naver";
import { scrapeFinancials } from "@/lib/webscrape";
import { extractInvestment } from "@/lib/investment";
import { getSearchTrend, trendToBonus } from "@/lib/trends";
import { scrapeOliveYoung, scrapeCoupang } from "@/lib/ecommerce";
import { computeBrandScore } from "@/lib/brandscore";
import type { NewsItem, FinancialSummaryRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const corp_code = searchParams.get("corp_code") || "";
  const q = (searchParams.get("q") || "").trim();
  const brand = (searchParams.get("brand") || q).trim();

  if (!q && !corp_code) {
    return NextResponse.json({ error: "q 또는 corp_code 파라미터 필요" }, { status: 400 });
  }

  try {
    // 1. 재무 데이터 (DART → 웹크롤링 폴백)
    let financials: FinancialSummaryRow[] = [];
    if (corp_code && isDartConfigured()) {
      financials = await getFinancials(corp_code).then(summarize).catch(() => []);
    }
    if (financials.length === 0 && q) {
      const scraped = await scrapeFinancials(q).catch(() => null);
      if (scraped) financials = scraped.rows;
    }

    // 2. 브랜드 기준 네이버 + e커머스 데이터 병렬 수집
    const searchTerm = brand || q;
    const [news, blog, shopping, investment, trend, oliveYoung, coupang] = await Promise.all([
      getNews(searchTerm, 15).catch(() => [] as NewsItem[]),
      getBlogs(searchTerm, 10).catch(() => [] as NewsItem[]),
      getShopping(searchTerm, 12).catch(() => []),
      extractInvestment(q, undefined).catch(() => null),
      getSearchTrend(searchTerm, []).catch(() => null),
      scrapeOliveYoung(searchTerm).catch(() => null),
      scrapeCoupang(searchTerm).catch(() => null),
    ]);

    const trendBonus = trend ? trendToBonus(trend) : null;

    // 3. 점수 계산
    const result = computeBrandScore({ financials, news, blog, shopping, investment, trendScore: trendBonus, oliveYoung, coupang });

    return NextResponse.json({
      ...result,
      trend: trend
        ? {
            keyword: trend.keyword,
            currentScore: trend.currentScore,
            trendDelta: trend.trendDelta,
            trendLabel: trend.trend,
            source: trend.source,
            points: trend.points.slice(-12),
          }
        : null,
      ecommerce: {
        oliveYoung: oliveYoung
          ? {
              productCount: oliveYoung.productCount,
              isInBest: oliveYoung.isInBest,
              bestRank: oliveYoung.bestRankProducts[0]?.rank ?? null,
              topReviews: oliveYoung.topProducts.reduce((s, p) => s + p.reviewCount, 0),
            }
          : null,
        coupang: coupang
          ? {
              productCount: coupang.productCount,
              avgRating: coupang.avgRating,
              totalReviews: coupang.totalReviews,
              rocketDeliveryCount: coupang.rocketDeliveryCount,
            }
          : null,
      },
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
