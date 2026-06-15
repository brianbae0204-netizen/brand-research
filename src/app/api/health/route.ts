import { NextResponse } from "next/server";
import { isDartConfigured } from "@/lib/dart";
import { isNaverConfigured } from "@/lib/naver";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    dart_key: isDartConfigured(),
    naver_key: isNaverConfigured(),
  });
}
