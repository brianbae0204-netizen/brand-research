import { NextResponse } from "next/server";
import { searchCorp, isDartConfigured } from "@/lib/dart";
import { getNews, getBlogs, getShopping, isNaverConfigured } from "@/lib/naver";
import { buildSources } from "@/lib/sources";
import type { ResearchPurpose, SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") || "").trim();
  const purpose = ((searchParams.get("purpose") || "investment") as ResearchPurpose);

  if (!query) {
    return NextResponse.json({ error: "쿼리(q) 파라미터가 필요합니다." }, { status: 400 });
  }

  const warnings: string[] = [];
  const result: SearchResult = {
    query,
    purpose,
    timestamp: new Date().toISOString(),
    dart_candidates: [],
    naver_news: [],
    naver_blog: [],
    naver_shopping: [],
    data_sources: buildSources(query, purpose),
    warnings,
  };

  // DART 회사 검색
  if (isDartConfigured()) {
    try {
      result.dart_candidates = await searchCorp(query, 10);
    } catch (e: any) {
      warnings.push(`DART 회사 검색 실패: ${e?.message || e}`);
    }
  } else {
    warnings.push("DART API 키가 설정되지 않아 한국 재무제표 자동 조회를 건너뜁니다.");
  }

  // 네이버 (병렬)
  if (isNaverConfigured()) {
    const [news, blog, shop] = await Promise.all([
      getNews(query, 8).catch(() => []),
      getBlogs(query, 6).catch(() => []),
      getShopping(query, 12).catch(() => []),
    ]);
    result.naver_news = news;
    result.naver_blog = blog;
    result.naver_shopping = shop;
  } else {
    warnings.push("네이버 API 키가 설정되지 않아 뉴스/블로그/쇼핑 자동 수집을 건너뜁니다.");
  }

  return NextResponse.json(result);
}
