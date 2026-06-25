/**
 * 브랜드 투자 평가 지표 — 5축 오각형 레이더 차트용 점수 계산
 *
 * 축 정의 (투자자 관점):
 *  1. 성장성      — 3개년 매출 CAGR · 뉴스 트렌드
 *  2. 수익성      — 영업이익률 · 당기순이익률
 *  3. 브랜드파워  — 쇼핑 노출 · 뉴스·블로그 언급량 · 채널 다양성
 *  4. 시장확장성  — 판매 채널 수 · 카테고리 다양성 · 글로벌 진출
 *  5. 투자매력도  — 투자 단계 · 누적 투자금액 · 최근성
 *
 * 모든 점수: 0~100  (20 이하=위험, 40=보통, 60=양호, 80=우수, 95=탁월)
 */

import type { FinancialSummaryRow, InvestmentInfo, NewsItem, ShoppingItem } from "./types";
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
  axes: [BrandAxisScore, BrandAxisScore, BrandAxisScore, BrandAxisScore, BrandAxisScore];
  overall: number;        // 5축 평균
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
      if (cagr < -10) score = 10;
      else if (cagr < 0) score = 22;
      else if (cagr < 10) score = 38;
      else if (cagr < 20) score = 52;
      else if (cagr < 40) score = 65;
      else if (cagr < 80) score = 78;
      else score = 90;
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
  if (opm < -20) score = 8;
  else if (opm < -10) score = 18;
  else if (opm < -3) score = 28;
  else if (opm < 0) score = 35;
  else if (opm < 5) score = 45;
  else if (opm < 10) score = 58;
  else if (opm < 20) score = 70;
  else if (opm < 30) score = 82;
  else score = 92;

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
// 축 4: 시장확장성
// ─────────────────────────────────────────────
export function scoreMarketScalability(
  shopping: ShoppingItem[],
  news: NewsItem[],
  blog: NewsItem[],
  coupang?: CoupangData | null
): BrandAxisScore {
  const sub: { label: string; value: string }[] = [];

  // 판매 채널 다각화 (최대 40점)
  const uniqueMalls = new Set(shopping.map((s) => s.mall)).size;
  const channelScore = uniqueMalls >= 6 ? 40 : uniqueMalls >= 4 ? 30 : uniqueMalls >= 2 ? 20 : uniqueMalls === 1 ? 12 : 5;
  sub.push({ label: "판매 채널 수", value: `${uniqueMalls}개` });

  // 카테고리 다양성 (최대 30점)
  const uniqueCats = new Set(shopping.map((s) => s.category).filter(Boolean)).size;
  const catScore = uniqueCats >= 4 ? 30 : uniqueCats >= 2 ? 20 : uniqueCats === 1 ? 12 : 5;
  sub.push({ label: "제품 카테고리", value: `${uniqueCats || "미확인"}개` });

  // 글로벌 진출 신호 (최대 20점)
  const globalKeywords = /아마존|글로벌|해외|미국|일본|중국|유럽|수출|sephora|ulta|walmart/i;
  const allText = [...news, ...blog].map((n) => `${n.title} ${n.desc}`).join(" ");
  const hasGlobal = globalKeywords.test(allText);
  const globalScore = hasGlobal ? 20 : 0;
  if (hasGlobal) sub.push({ label: "글로벌 진출", value: "언급 있음" });

  // 가격 프리미엄 (최대 10점)
  const avgPrice = shopping.length > 0
    ? shopping.reduce((s, i) => s + i.price, 0) / shopping.length
    : 0;
  const premiumScore = avgPrice > 80_000 ? 10 : avgPrice > 40_000 ? 7 : avgPrice > 15_000 ? 4 : 0;
  if (avgPrice > 0) sub.push({ label: "평균 판매가", value: `${Math.round(avgPrice / 1000)}천원` });

  // 쿠팡 로켓배송 = 대형 플랫폼 진입 확인 (최대 +10)
  let coupangBonus = 0;
  if (coupang) {
    coupangBonus = coupang.rocketDeliveryCount > 0 ? 10 : coupang.productCount > 0 ? 5 : 0;
    if (coupang.rocketDeliveryCount > 0) sub.push({ label: "쿠팡 로켓배송", value: `${coupang.rocketDeliveryCount}개` });
  }

  const score = channelScore + catScore + globalScore + premiumScore + coupangBonus;
  const confidence: BrandAxisScore["confidence"] = shopping.length > 0 || coupang ? "estimated" : "unknown";

  return {
    score: clamp(score),
    label: "시장확장성",
    emoji: "🌏",
    detail: `채널 ${uniqueMalls}개 · 카테고리 ${uniqueCats}개${hasGlobal ? " · 글로벌" : ""}${coupang?.rocketDeliveryCount ? " · 쿠팡로켓" : ""}`,
    confidence,
    subScores: sub,
  };
}

// ─────────────────────────────────────────────
// 축 5: 투자매력도
// ─────────────────────────────────────────────
export function scoreInvestmentAttractiveness(
  investment: InvestmentInfo | null,
  news: NewsItem[]
): BrandAxisScore {
  const sub: { label: string; value: string }[] = [];

  if (!investment || investment.dealCount === 0) {
    // 투자 이력 없어도 성장 뉴스로 보정
    const growthSignals = news.filter((n) =>
      /투자|펀딩|성장|확대|매출|수출|시리즈/.test(`${n.title} ${n.desc}`)
    ).length;
    const score = clamp(15 + growthSignals * 3, 10, 40);
    return {
      score,
      label: "투자매력도",
      emoji: "🎯",
      detail: "투자 이력 없음 — 성장 신호 기반 추정",
      confidence: "unknown",
      subScores: [{ label: "성장 신호 뉴스", value: `${growthSignals}건` }],
    };
  }

  // 투자 단계 기준 점수
  const STAGE_SCORE: Record<string, number> = {
    "시드": 32, "프리 시리즈A": 44, "시리즈 A": 56,
    "시리즈 B": 66, "시리즈 C": 74, "시리즈 D": 80,
    "IPO/상장": 85,
  };
  const stageScore = investment.stage ? (STAGE_SCORE[investment.stage] ?? 35) : 25;
  if (investment.stage) sub.push({ label: "투자 단계", value: investment.stage });

  // 누적 투자금액 보정
  let amountBonus = 0;
  const amt = investment.totalAmount ?? 0;
  if (amt > 5e10) amountBonus = 20;        // 500억+
  else if (amt > 1e10) amountBonus = 13;   // 100억+
  else if (amt > 5e9) amountBonus = 8;     // 50억+
  else if (amt > 1e9) amountBonus = 4;     // 10억+

  if (amt > 0) {
    const fmtAmt = amt >= 1e12 ? `${(amt / 1e12).toFixed(1)}조` : `${Math.round(amt / 1e8)}억`;
    sub.push({ label: "누적 투자유치", value: fmtAmt });
  }

  // 투자 건수 보정 (활발한 투자 = 검증된 기업)
  const dealBonus = Math.min(investment.dealCount * 2, 8);
  sub.push({ label: "투자 건수", value: `${investment.dealCount}건` });

  // 최근성 보정 — 가장 최근 기사 날짜 기준
  let recencyBonus = 0;
  if (investment.evidence.length > 0) {
    const dates = investment.evidence
      .map((e) => e.date ? new Date(e.date).getFullYear() : 0)
      .filter(Boolean);
    const latestYear = dates.length > 0 ? Math.max(...dates) : 0;
    if (latestYear >= 2024) recencyBonus = 10;
    else if (latestYear >= 2022) recencyBonus = 5;
    if (latestYear > 0) sub.push({ label: "최근 투자", value: `${latestYear}년` });
  }

  const score = stageScore + amountBonus + dealBonus + recencyBonus;

  return {
    score: clamp(score),
    label: "투자매력도",
    emoji: "🎯",
    detail: investment.stage ? `${investment.stage} 단계 · ${investment.dealCount}건` : `투자 ${investment.dealCount}건`,
    confidence: "estimated",
    subScores: sub,
  };
}

// ─────────────────────────────────────────────
// 최종 점수 조합
// ─────────────────────────────────────────────
export function computeBrandScore(params: {
  financials: FinancialSummaryRow[];
  news: NewsItem[];
  blog: NewsItem[];
  shopping: ShoppingItem[];
  investment: InvestmentInfo | null;
  trendScore?: number | null;
  oliveYoung?: OliveYoungData | null;
  coupang?: CoupangData | null;
}): BrandScoreResult {
  const { financials, news, blog, shopping, investment, trendScore, oliveYoung, coupang } = params;

  const growthAxis   = scoreGrowth(financials, news, trendScore);
  const profitAxis   = scoreProfitability(financials);
  const brandAxis    = scoreBrandPower(shopping, news, blog, trendScore, oliveYoung, coupang);
  const marketAxis   = scoreMarketScalability(shopping, news, blog, coupang);
  const investAxis   = scoreInvestmentAttractiveness(investment, news);

  const axes = [growthAxis, profitAxis, brandAxis, marketAxis, investAxis] as BrandScoreResult["axes"];
  const overall = Math.round(axes.reduce((s, a) => s + a.score, 0) / 5);
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
