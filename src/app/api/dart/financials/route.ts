import { NextResponse } from "next/server";
import { getCompanyInfo, getFinancials, summarize, isDartConfigured } from "@/lib/dart";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isDartConfigured()) {
    return NextResponse.json({ error: "DART API 키가 설정되지 않았습니다." }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const corp_code = searchParams.get("corp_code") || "";
  if (!corp_code) {
    return NextResponse.json({ error: "corp_code가 필요합니다." }, { status: 400 });
  }

  try {
    const [info, financials] = await Promise.all([
      getCompanyInfo(corp_code),
      getFinancials(corp_code),
    ]);
    const summary = summarize(financials);
    return NextResponse.json({ info, summary });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
