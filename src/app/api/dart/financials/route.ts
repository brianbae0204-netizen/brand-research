import { NextResponse } from "next/server";
import { getCompanyInfo, getFinancials, summarize, isDartConfigured } from "@/lib/dart";
import { scrapeFinancials } from "@/lib/webscrape";
import type { FinancialSummaryRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Vercel 함수 실행 제한(초) — 외부 API 수집이 길어질 수 있어 상향

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const corp_code = searchParams.get("corp_code") || "";
  const corp_name = searchParams.get("corp_name") || "";

  if (!corp_code && !corp_name) {
    return NextResponse.json({ error: "corp_code 또는 corp_name이 필요합니다." }, { status: 400 });
  }

  try {
    let info = null;
    let summary: FinancialSummaryRow[] = [];

    // DART 시도
    if (corp_code && isDartConfigured()) {
      const [dartInfo, financials] = await Promise.all([
        getCompanyInfo(corp_code),
        getFinancials(corp_code),
      ]);
      info = dartInfo;
      summary = summarize(financials);
    }

    // DART 재무 없으면 웹 크롤링 폴백
    if (summary.length === 0 && corp_name) {
      const scraped = await scrapeFinancials(corp_name).catch(() => null);
      if (scraped) summary = scraped.rows;
    }

    return NextResponse.json({ info, summary });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
