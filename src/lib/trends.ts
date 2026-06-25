/**
 * 검색 트렌드 데이터 수집
 *
 * 소스 우선순위:
 *  1. 네이버 DataLab 검색어 트렌드 API — 월별 상대 검색량 (0~100)
 *     → 동일한 NAVER_CLIENT_ID/SECRET 사용
 *     → developers.naver.com 앱 설정에서 "데이터랩(검색어 트렌드)" 추가 필요
 *  2. 네이버 DataLab 쇼핑인사이트 API — 카테고리별 쇼핑 검색량
 *  3. Google Trends (비공식 API) — 글로벌 검색 트렌드
 *  4. 폴백: 뉴스 날짜 분포로 트렌드 추정
 */

import type { NewsItem } from "./types";

const NAVER_ID = process.env.NAVER_CLIENT_ID?.trim() || "";
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET?.trim() || "";

export interface TrendPoint {
  period: string;   // "2024-01"
  ratio: number;    // 0~100 (최고점 대비 상대값)
}

export interface TrendResult {
  keyword: string;
  points: TrendPoint[];
  currentScore: number;     // 최근 3개월 평균
  trend: "상승" | "하락" | "보합";
  trendDelta: number;       // 전년 동기 대비 변화율 (%)
  source: "datalab" | "shopping" | "news_fallback";
}

// ─────────────────────────────────────────────
// 네이버 DataLab 검색어 트렌드
// ─────────────────────────────────────────────
async function fetchNaverSearchTrend(keyword: string): Promise<TrendResult | null> {
  if (!NAVER_ID || !NAVER_SECRET) return null;

  const now = new Date();
  const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const startYear = now.getFullYear() - 2;
  const startDate = `${startYear}-01-01`;

  try {
    const res = await fetch("https://openapi.naver.com/v1/datalab/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Naver-Client-Id": NAVER_ID,
        "X-Naver-Client-Secret": NAVER_SECRET,
      },
      body: JSON.stringify({
        startDate,
        endDate,
        timeUnit: "month",
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
      }),
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.results?.[0]?.data as { period: string; ratio: number }[] | undefined;
    if (!results || results.length === 0) return null;

    return buildTrendResult(keyword, results, "datalab");
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 네이버 DataLab 쇼핑 인사이트
// ─────────────────────────────────────────────
async function fetchNaverShoppingTrend(keyword: string): Promise<TrendResult | null> {
  if (!NAVER_ID || !NAVER_SECRET) return null;

  const now = new Date();
  const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const startYear = now.getFullYear() - 2;
  const startDate = `${startYear}-01-01`;

  try {
    const res = await fetch("https://openapi.naver.com/v1/datalab/shopping/categories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Naver-Client-Id": NAVER_ID,
        "X-Naver-Client-Secret": NAVER_SECRET,
      },
      body: JSON.stringify({
        startDate,
        endDate,
        timeUnit: "month",
        category: [{ name: keyword, param: [keyword] }],
        device: "",
        ages: [],
        gender: "",
      }),
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = await res.json();
    const results = data?.results?.[0]?.data as { period: string; ratio: number }[] | undefined;
    if (!results || results.length === 0) return null;

    return buildTrendResult(keyword, results, "shopping");
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 뉴스 날짜 분포 기반 폴백 트렌드
// ─────────────────────────────────────────────
function buildNewsFallbackTrend(keyword: string, news: NewsItem[]): TrendResult {
  // 월별 기사 수로 트렌드 근사
  const monthlyCounts: Record<string, number> = {};
  const now = new Date();

  for (const n of news) {
    if (!n.date) continue;
    try {
      const d = new Date(n.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyCounts[key] = (monthlyCounts[key] || 0) + 1;
    } catch {
      /* ignore */
    }
  }

  // 최근 12개월 슬롯 생성
  const points: TrendPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    points.push({ period, ratio: (monthlyCounts[period] || 0) * 10 }); // 1건 = 10점 환산
  }

  // 최고값 기준 정규화 (0~100)
  const maxVal = Math.max(...points.map((p) => p.ratio), 1);
  const normalized = points.map((p) => ({ ...p, ratio: Math.round((p.ratio / maxVal) * 100) }));

  return buildTrendResult(keyword, normalized, "news_fallback");
}

// ─────────────────────────────────────────────
// 공통 TrendResult 빌더
// ─────────────────────────────────────────────
function buildTrendResult(
  keyword: string,
  rawPoints: { period: string; ratio: number }[],
  source: TrendResult["source"]
): TrendResult {
  const points: TrendPoint[] = rawPoints.map((p) => ({ period: p.period, ratio: p.ratio }));

  // 최근 3개월 평균 (현재 점수)
  const recent = points.slice(-3);
  const currentScore = recent.length > 0
    ? Math.round(recent.reduce((s, p) => s + p.ratio, 0) / recent.length)
    : 0;

  // 전년 동기 3개월 평균
  const yearAgo = points.slice(-15, -12);
  const prevScore = yearAgo.length > 0
    ? Math.round(yearAgo.reduce((s, p) => s + p.ratio, 0) / yearAgo.length)
    : null;

  const trendDelta = prevScore && prevScore > 0
    ? Math.round(((currentScore - prevScore) / prevScore) * 100)
    : 0;

  const trend: TrendResult["trend"] =
    trendDelta > 10 ? "상승" : trendDelta < -10 ? "하락" : "보합";

  return { keyword, points, currentScore, trend, trendDelta, source };
}

// ─────────────────────────────────────────────
// Google Trends (비공식 npm 패키지)
// 주의: 공식 API 아님 — Google 정책 변경 시 차단 가능
// 대안: SerpAPI (유료), 또는 네이버 DataLab으로 충분
// ─────────────────────────────────────────────
async function fetchGoogleTrend(keyword: string): Promise<TrendResult | null> {
  try {
    // 동적 import — 서버 환경에서만 실행
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const googleTrends = require("google-trends-api");

    const now = new Date();
    const startTime = new Date(now.getFullYear() - 2, 0, 1);

    const raw = await googleTrends.interestOverTime({
      keyword,
      startTime,
      endTime: now,
      geo: "KR",
    });

    const data = JSON.parse(raw);
    const timelineData = data?.default?.timelineData as { time: string; value: number[] }[] | undefined;
    if (!timelineData || timelineData.length === 0) return null;

    // 월별로 집계 (주 단위 → 월 평균)
    const monthly: Record<string, number[]> = {};
    for (const point of timelineData) {
      const d = new Date(Number(point.time) * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) monthly[key] = [];
      monthly[key].push(point.value[0] ?? 0);
    }

    const rawPoints = Object.entries(monthly)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, vals]) => ({
        period,
        ratio: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
      }));

    if (rawPoints.length === 0) return null;
    return buildTrendResult(keyword, rawPoints, "datalab"); // source 표시는 datalab 재활용
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// 메인 진입점
// ─────────────────────────────────────────────
export async function getSearchTrend(
  keyword: string,
  fallbackNews: NewsItem[] = []
): Promise<TrendResult> {
  // 1순위: 네이버 DataLab 검색어 트렌드
  const searchTrend = await fetchNaverSearchTrend(keyword).catch(() => null);
  if (searchTrend) return searchTrend;

  // 2순위: 네이버 쇼핑 인사이트
  const shoppingTrend = await fetchNaverShoppingTrend(keyword).catch(() => null);
  if (shoppingTrend) return shoppingTrend;

  // 3순위: Google Trends (비공식)
  const googleTrend = await fetchGoogleTrend(keyword).catch(() => null);
  if (googleTrend) return { ...googleTrend, source: "datalab" as const }; // "Google Trends" 표시용

  // 4순위: 뉴스 기반 폴백
  return buildNewsFallbackTrend(keyword, fallbackNews);
}

/** 트렌드 점수를 brandscore 보정값(0~100)으로 변환 */
export function trendToBonus(trend: TrendResult): number {
  // 현재 검색량 + 상승 트렌드 조합
  const base = trend.currentScore;
  const momentum = trend.trendDelta > 0 ? Math.min(trend.trendDelta * 0.3, 20) : Math.max(trend.trendDelta * 0.2, -15);
  return Math.round(Math.max(0, Math.min(100, base + momentum)));
}
