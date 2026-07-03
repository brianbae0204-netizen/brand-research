/**
 * 브랜드 투자 평가 지표 — 4축 레이더 차트용 점수 계산
 *
 * 축 정의 (투자자 관점):
 *  1. 성장성          — 매출 CAGR · 뉴스 트렌드
 *  2. 수익성          — 영업이익률 · 당기순이익률
 *  3. 글로벌 성장 가능성 — 해외 진출·글로벌 플랫폼(아마존·세포라 등) 노출
 *  4. 브랜드파워      — 쇼핑 노출 · 뉴스·블로그 언급량 · 소비자 리뷰(올리브영/쿠팡)
 *
 * 모든 점수: 0~100  (20 이하=위험, 40=보통, 60=양호, 80=우수, 95=탁월)
 *
 * 채점 기준(캘리브레이션): 업계 평균 수준(매출 CAGR 15~20%, 영업이익률 8~10%)을
 * "양호(60점대)"로 보정. 성장기 재투자로 인한 저마진은 그 자체로 감점 요인이
 * 아니므로 중립값을 기본으로 함.
 */

import type { FinancialSummaryRow, NewsItem, ShoppingItem } from "./types";
import type { OliveYoungData, CoupangData } from "./ecommerce";

export interface BrandAxisScore {
  score: number;          // 0~100
  label: string;          // 축 이름
  emoji: string;
  detail: string;         // 점수 산정 근거 (한 줄)
  confidence: "confirmed" | "estimated" | "unknown";
  subScores?: { label: string; value: string }[];
}

export interface BrandScoreResult {
  axes: [BrandAxisScore, BrandAxisScore, BrandAxisScore, BrandAxisScore];
  overall: number;        // 4축 평균
  grade: "S" | "A" | "B" | "C" | "D";
  gradeLabel: string;
  summary: string;        // AI 없이 규칙 기반 요약
  trendBonus: number;     // Naver DataLab 트렌드 보정 (+/-10)
}

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function clamp(v: number, min = 5, max = 95) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function grade(score: number): BrandScoreResult["grade"] {
  if (score >= 80) return "S";
  if (score >= 65) return "A";
  if (score >= 50) return "B";
  if (score >= 35) return "C";
  return "D";
}

function gradeLabel(g: BrandScoreResult["grade"]): string {
  return { S: "탁월 — 투자 적극 검토", A: "우수 — 투자 긍정", B: "양호 — 조건부 검토", C: "보통 — 추가 실사 필요", D: "미흡 — 신중 접근" }[g];
}

// ─────────────────────────────────────────────
// 축 1: 성장성
// ─────────────────────────────────────────────
export function scoreGrowth(
  financials: FinancialSummaryRow[],
  news: NewsItem[],
  trendScore?: number | null
): BrandAxisScore {
  const sorted = [...financials]
    .filter((r) => (r.values["매출액"] ?? null) !== null)
    .sort((a, b) => a.year - b.year);

  const sub: { label: string; value: string }[] = [];
  let score = 30;
  let detail = "재무 데이터 없음";
  let confidence: BrandAxisScore["confidence"] = "unknown";

  if (sorted.length >= 2) {
    const first = sorted[0].values["매출액"]!;
    const last = sorted[sorted.length - 1].values["매출액"]!;
    const years = sorted[sorted.length - 1].year - sorted[0].year;
    if (first > 0 && years > 0) {
      const cagr = (Math.pow(last / first, 1 / years) - 1) * 100;
      sub.push({ label: "매출 CAGR", value: `${cagr >= 0 ? "+" : ""}${cagr.toFixed(1)}%` });
      // 업계 평균 CAGR(15~20%)을 "양호"로 보는 기준으로 보정
      if (cagr < -10) score = 15;
      else if (cagr < 0) score = 30;
      else if (cagr < 5) score = 42;
      else if (cagr < 10) score = 50;
      else if (cagr < 15) score = 58;
      else if (cagr < 20) score = 65;
      else if (cagr < 30) score = 73;
      else if (cagr < 50) score = 82;
      else score = 92;
      detail = `${years}개년 매출 CAGR ${cagr >= 0 ? "+" : ""}${cagr.toFixed(1)}%`;
      confidence = sorted[0].fs_div === "WEB" ? "estimated" : "confirmed";
    }
  } else if (sorted.length === 1) {
    // 1개년 데이터만 있어도 양호 베이스
    score = 40;
    detail = "1개년 매출 데이터";
    confidence = sorted[0].fs_div === "WEB" ? "estimated" : "estimated";
  } else {
    // 뉴스 언급 빈도로 성장 신호 추정
    const growthKeywords = /성장|확대|증가|달성|신기록|최대|상승|글로벌|수출/;
    const positiveNews = news.filter((n) => growthKeywords.test(`${n.title} ${n.desc}`)).length;
    score = clamp(25 + positiveNews * 4, 15, 55);
    detail = `뉴스 트렌드 추정 (성장 관련 ${positiveNews}건)`;
    confidence = "unknown";
  }

  // 트렌드 보정
  if (trendScore && trendScore > 0) {
    score = clamp(score + trendScore * 0.1, 5, 95);
    sub.push({ label: "검색 트렌드", value: `+${trendScore.toFixed(0)}pt` });
  }

  return { score: clamp(score), label: "성장성", emoji: "📈", detail, confidence, subScores: sub };
}

// ─────────────────────────────────────────────
// 축 2: 수익성
// ─────────────────────────────────────────────
export function scoreProfitability(financials: FinancialSummaryRow[]): BrandAxisScore {
  const sorted = [...financials]
    .filter((r) => (r.values["매출액"] ?? null) !== null && (r.values["영업이익"] ?? null) !== null)
    .sort((a, b) => b.year - a.year);

  const sub: { label: string; value: string }[] = [];

  if (sorted.length === 0) {
    return {
      score: 20, label: "수익성", emoji: "💰",
      detail: "재무 데이터 없음 — DART 미공시", confidence: "unknown",
    };
  }

  const latest = sorted[0];
  const rev = latest.values["매출액"]!;
  const op = latest.values["영업이익"]!;
  const ni = latest.values["당기순이익"] ?? null;

  const opm = rev > 0 ? (op / rev) * 100 : 0;
  sub.push({ label: `OPM (${latest.year})`, value: `${opm.toFixed(1)}%` });
  if (ni !== null && rev > 0) sub.push({ label: "순이익률", value: `${((ni / rev) * 100).toFixed(1)}%` });

  let score: number;
  // 업계 평균 OPM(8~10%)을 "양호"로 보는 기준으로 보정 — 성장기 재투자로 인한 저마진을 과도하게 벌점하지 않음
  if (opm < -20) score = 15;
  else if (opm < -10) score = 25;
  else if (opm < -3) score = 35;
  else if (opm < 0) score = 42;
  else if (opm < 3) score = 50;
  else if (opm < 8) score = 58;
  else if (opm < 15) score = 68;
  else if (opm < 25) score = 80;
  else score = 90;

  // 3개년 개선 트렌드 보정
  if (sorted.length >= 2) {
    const prev = sorted[1];
    const prevRev = prev.values["매출액"];
    const prevOp = prev.values["영업이익"];
    if (prevRev && prevOp && prevRev > 0) {
      const prevOpm = (prevOp / prevRev) * 100;
      const trend = opm - prevOpm;
      if (trend > 5) { score += 8; sub.push({ label: "OPM 개선", value: `+${trend.toFixed(1)}pp` }); }
      else if (trend < -5) { score -= 6; sub.push({ label: "OPM 악화", value: `${trend.toFixed(1)}pp` }); }
    }
  }

  const confidence = sorted[0].fs_div === "WEB" ? "estimated" : "confirmed";
  const detail = `OPM ${opm.toFixed(1)}% (${latest.year})`;
  return { score: clamp(score), label: "수익성", emoji: "💰", detail, confidence, subScores: sub };
}

// ─────────────────────────────────────────────
// 축 3: 브랜드파워
// ─────────────────────────────────────────────
export function scoreBrandPower(
  shopping: ShoppingItem[],
  news: NewsItem[],
  blog: NewsItem[],
  trendScore?: number | null,
  oliveYoung?: OliveYoungData | null,
  coupang?: CoupangData | null
): BrandAxisScore {
  const sub: { label: string; value: string }[] = [];

  // 쇼핑 노출 (최대 25점)
  const shopScore = clamp(Math.min(shopping.length * 3, 25), 0, 25);
  sub.push({ label: "쇼핑 노출", value: `${shopping.length}개` });

  // 뉴스 언급 (최대 20점)
  const newsScore = clamp(Math.min(news.length * 3, 20), 0, 20);
  sub.push({ label: "뉴스 기사", value: `${news.length}건` });

  // 블로그 리뷰 (최대 15점)
  const blogScore = clamp(Math.min(blog.length * 3, 15), 0, 15);
  sub.push({ label: "블로그 리뷰", value: `${blog.length}건` });

  // 채널 다양성 (쇼핑몰 수, 최대 10점)
  const uniqueMalls = new Set(shopping.map((s) => s.mall)).size;
  const mallScore = clamp(Math.min(uniqueMalls * 2, 10), 0, 10);
  sub.push({ label: "판매 채널", value: `${uniqueMalls}개 몰` });

  let score = shopScore + newsScore + blogScore + mallScore;

  // 올리브영 지표 (최대 +15점)
  if (oliveYoung) {
    const oyProductScore = Math.min(oliveYoung.productCount * 0.5, 8);
    const oyBestBonus = oliveYoung.isInBest ? 7 : 0;
    score += oyProductScore + oyBestBonus;
    sub.push({ label: "올리브영 상품", value: `${oliveYoung.productCount}개` });
    if (oliveYoung.isInBest) {
      sub.push({ label: "올리브영 베스트", value: `${oliveYoung.bestRankProducts[0]?.rank}위` });
    }
    const totalOYReviews = oliveYoung.topProducts.reduce((s, p) => s + p.reviewCount, 0);
    if (totalOYReviews > 0) sub.push({ label: "올리브영 리뷰", value: `${totalOYReviews.toLocaleString()}개` });
  }

  // 쿠팡 지표 (최대 +10점)
  if (coupang) {
    const coupangScore = Math.min(coupang.productCount * 0.3, 5);
    const ratingBonus = coupang.avgRating >= 4.5 ? 5 : coupang.avgRating >= 4.0 ? 3 : coupang.avgRating > 0 ? 1 : 0;
    score += coupangScore + ratingBonus;
    sub.push({ label: "쿠팡 상품", value: `${coupang.productCount}개` });
    if (coupang.avgRating > 0) sub.push({ label: "쿠팡 평점", value: `${coupang.avgRating}점` });
    if (coupang.totalReviews > 0) sub.push({ label: "쿠팡 리뷰", value: `${coupang.totalReviews.toLocaleString()}개` });
  }

  // 검색 트렌드 보정 (최대 +10)
  if (trendScore && trendScore > 0) {
    score += Math.min(trendScore * 0.1, 10);
    sub.push({ label: "검색 트렌드", value: `+${trendScore.toFixed(0)}pt` });
  }

  const confidence: BrandAxisScore["confidence"] =
    (oliveYoung || coupang) ? "estimated" :
    shopping.length > 0 || news.length > 0 ? "estimated" : "unknown";

  const detailParts: string[] = [`쇼핑 ${shopping.length}개 · 뉴스 ${news.length}건`];
  if (oliveYoung) detailParts.push(`올리브영 ${oliveYoung.productCount}개${oliveYoung.isInBest ? " (베스트)" : ""}`);
  if (coupang) detailParts.push(`쿠팡 ${coupang.productCount}개`);

  return {
    score: clamp(score),
    label: "브랜드파워",
    emoji: "⭐",
    detail: detailParts.join(" · "),
    confidence,
    subScores: sub,
  };
}

// ─────────────────────────────────────────────
// 축 3: 글로벌 성장 가능성
// ─────────────────────────────────────────────
const GLOBAL_SIGNAL = /글로벌|해외\s?진출|해외|수출|미국|일본|중국|유럽|동남아|베트남|대만|홍콩|싱가포르/;
const GLOBAL_PLATFORM = /아마존|amazon|세포라|sephora|얼타|ulta|월마트|walmart|큐텐|qoo10|알리익스프레스|aliexpress|타오바오|라자다|lazada|쇼피|shopee/i;

export function scoreGlobalGrowth(
  news: NewsItem[],
  blog: NewsItem[]
): BrandAxisScore {
  const sub: { label: string; value: string }[] = [];
  const allText = [...news, ...blog];

  const signalHits = allText.filter((n) => GLOBAL_SIGNAL.test(`${n.title} ${n.desc}`));
  const platformHits = allText.filter((n) => GLOBAL_PLATFORM.test(`${n.title} ${n.desc}`));

  let score: number;
  if (allText.length === 0) score = 20;
  else if (signalHits.length === 0) score = 25;
  else if (signalHits.length <= 2) score = 40;
  else if (signalHits.length <= 4) score = 52;
  else if (signalHits.length <= 7) score = 65;
  else if (signalHits.length <= 12) score = 78;
  else score = 90;

  sub.push({ label: "글로벌 언급 기사", value: `${signalHits.length}건` });

  if (platformHits.length > 0) {
    score += 10;
    const platforms = new Set<string>();
    for (const n of platformHits) {
      const m = `${n.title} ${n.desc}`.match(GLOBAL_PLATFORM);
      if (m) platforms.add(m[0]);
    }
    sub.push({ label: "글로벌 플랫폼 노출", value: [...platforms].slice(0, 3).join(", ") });
  }

  const confidence: BrandAxisScore["confidence"] = allText.length > 0 ? "estimated" : "unknown";
  const detail =
    signalHits.length > 0
      ? `글로벌 관련 기사 ${signalHits.length}건${platformHits.length > 0 ? " · 해외 플랫폼 노출 확인" : ""}`
      : allText.length > 0
      ? "글로벌 진출 신호 없음"
      : "뉴스·블로그 데이터 없음";

  return { score: clamp(score), label: "글로벌 성장 가능성", emoji: "🌏", detail, confidence, subScores: sub };
}

// ─────────────────────────────────────────────
// 최종 점수 조합
// ─────────────────────────────────────────────
export function computeBrandScore(params: {
  financials: FinancialSummaryRow[];
  news: NewsItem[];
  blog: NewsItem[];
  shopping: ShoppingItem[];
  trendScore?: number | null;
  oliveYoung?: OliveYoungData | null;
  coupang?: CoupangData | null;
}): BrandScoreResult {
  const { financials, news, blog, shopping, trendScore, oliveYoung, coupang } = params;

  const growthAxis = scoreGrowth(financials, news, trendScore);
  const profitAxis = scoreProfitability(financials);
  const globalAxis = scoreGlobalGrowth(news, blog);
  const brandAxis  = scoreBrandPower(shopping, news, blog, trendScore, oliveYoung, coupang);

  const axes = [growthAxis, profitAxis, globalAxis, brandAxis] as BrandScoreResult["axes"];
  const overall = Math.round(axes.reduce((s, a) => s + a.score, 0) / 4);
  const g = grade(overall);

  // 규칙 기반 요약
  const strengths = axes.filter((a) => a.score >= 65).map((a) => a.label);
  const weaknesses = axes.filter((a) => a.score < 40).map((a) => a.label);
  const summary =
    strengths.length > 0
      ? `${strengths.join("·")} 강점 보유${weaknesses.length > 0 ? `, ${weaknesses.join("·")} 보완 필요` : " — 전반적 양호"}`
      : weaknesses.length > 0
      ? `${weaknesses.join("·")} 취약 — 추가 실사 필요`
      : "전반적 보통 수준 — 세부 항목 검토 권장";

  return { axes, overall, grade: g, gradeLabel: gradeLabel(g), summary, trendBonus: trendScore ?? 0 };
}
