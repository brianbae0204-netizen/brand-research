import { NextResponse } from "next/server";
import { searchCorp, isDartConfigured } from "@/lib/dart";
import { buildSources } from "@/lib/sources";
import { aiResolveCorp, isGeminiConfigured } from "@/lib/gemini";
import type { ResearchPurpose, SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 검색 1단계 — DART 등록 회사 후보 반환.
 * - 입력이 브랜드명이라 DART 등록명과 불일치(0건)하면, AI가 운영 법인명을 추정해 재검색.
 *   예: "온그리디언츠" → "파워플레이어" → DART 재검색
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

  // DART 검색 0건 → 브랜드명일 가능성 → AI에게 운영 법인 매핑 요청
  if (result.dart_candidates.length === 0 && isDartConfigured() && isGeminiConfigured()) {
    try {
      const mapping = await aiResolveCorp(query);
      if (mapping?.corpName && mapping.confidence !== "low") {
        const recandidates = await searchCorp(mapping.corpName, 10);
        if (recandidates.length > 0) {
          result.dart_candidates = recandidates;
          result.mappedFrom = {
            input: query,
            mappedTo: mapping.corpName,
            confidence: mapping.confidence,
            reason: mapping.reason,
          };
        }
      }
    } catch (e: any) {
      warnings.push(`AI 브랜드 매핑 실패: ${e?.message || e}`);
    }
  }

  return NextResponse.json(result);
}
