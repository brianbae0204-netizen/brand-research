import { NextResponse } from "next/server";
import { searchCorp, isDartConfigured } from "@/lib/dart";
import { buildSources } from "@/lib/sources";
import type { ResearchPurpose, SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 검색 1단계 — DART 등록 회사 후보만 반환.
 * 뉴스/쇼핑/블로그/개요/AI는 회사 선택 후 /api/overview 에서 브랜드 기준으로 수집.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") || "").trim();
  const purpose = (searchParams.get("purpose") || "investment") as ResearchPurpose;

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

  if (isDartConfigured()) {
    try {
      result.dart_candidates = await searchCorp(query, 10);
    } catch (e: any) {
      warnings.push(`DART 회사 검색 실패: ${e?.message || e}`);
    }
  } else {
    warnings.push("DART API 키가 설정되지 않아 회사 검색을 건너뜁니다.");
  }

  return NextResponse.json(result);
}
