"use client";

import { useMemo } from "react";
import type { BrandScoreResult, BrandAxisScore } from "@/lib/brandscore";

interface EcommerceData {
  oliveYoung?: {
    productCount: number;
    isInBest: boolean;
    bestRank: number | null;
    topReviews: number;
  } | null;
  coupang?: {
    productCount: number;
    avgRating: number;
    totalReviews: number;
    rocketDeliveryCount: number;
  } | null;
}

interface Props {
  result: BrandScoreResult;
  trendData?: {
    keyword: string;
    currentScore: number;
    trendDelta: number;
    trendLabel: string;
    source: string;
    points: { period: string; ratio: number }[];
  } | null;
  ecommerce?: EcommerceData | null;
  corpName?: string;
}

// ─────────────────────────────────────────────
// SVG 오각형 레이더 차트
// ─────────────────────────────────────────────
const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2;
const MAX_R = 115;
const GRID_LEVELS = [20, 40, 60, 80, 100];
const AXIS_COUNT = 5;

function polar(angle: number, r: number) {
  return {
    x: CX + r * Math.cos(angle),
    y: CY + r * Math.sin(angle),
  };
}

// 5개 축 각도 (위에서 시작, 시계방향)
const ANGLES = Array.from({ length: AXIS_COUNT }, (_, i) =>
  -Math.PI / 2 + (i * 2 * Math.PI) / AXIS_COUNT
);

function polygonPoints(values: number[]): string {
  return values
    .map((v, i) => {
      const r = (v / 100) * MAX_R;
      const p = polar(ANGLES[i], r);
      return `${p.x},${p.y}`;
    })
    .join(" ");
}

const GRADE_COLOR: Record<string, string> = {
  S: "#8b5cf6",
  A: "#3b82f6",
  B: "#10b981",
  C: "#f59e0b",
  D: "#ef4444",
};

const CONFIDENCE_DOT: Record<BrandAxisScore["confidence"], string> = {
  confirmed: "🟢",
  estimated: "🟡",
  unknown: "⚪",
};

// ─────────────────────────────────────────────
// 트렌드 스파크라인
// ─────────────────────────────────────────────
function Sparkline({ points }: { points: { period: string; ratio: number }[] }) {
  if (points.length < 2) return null;
  const W = 120, H = 32;
  const maxR = Math.max(...points.map((p) => p.ratio), 1);
  const pts = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - (p.ratio / maxR) * (H - 4) - 2;
    return `${x},${y}`;
  });
  const latest = points[points.length - 1].ratio;
  const prev = points[points.length - 2]?.ratio ?? latest;
  const up = latest >= prev;

  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={up ? "#10b981" : "#f59e0b"}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* 마지막 점 */}
      <circle
        cx={W}
        cy={H - (latest / maxR) * (H - 4) - 2}
        r={3}
        fill={up ? "#10b981" : "#f59e0b"}
      />
    </svg>
  );
}

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export function BrandScoreChart({ result, trendData, ecommerce, corpName }: Props) {
  const scores = useMemo(() => result.axes.map((a) => a.score), [result]);
  const gradeColor = GRADE_COLOR[result.grade] ?? "#6b7280";

  const axisLabels = result.axes.map((a, i) => {
    const offset = 28;
    const p = polar(ANGLES[i], MAX_R + offset);
    const isLeft = ANGLES[i] < -Math.PI / 4 || ANGLES[i] > Math.PI * 0.75;
    return { x: p.x, y: p.y, label: a.label, emoji: a.emoji, score: a.score, isLeft };
  });

  return (
    <div className="card p-5 space-y-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            🏆 브랜드 투자 평가 지표
            {corpName && <span className="text-sm font-normal text-slate-500">— {corpName}</span>}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">투자자 관점 5축 종합 평가 · 점수는 추정치이므로 검증 필요</p>
        </div>
        {/* 종합 등급 뱃지 */}
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div
              className="text-3xl font-black tabular-nums leading-none"
              style={{ color: gradeColor }}
            >
              {result.overall}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">/ 100</div>
          </div>
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black text-white shadow-lg"
            style={{ background: gradeColor }}
          >
            {result.grade}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* 오각형 레이더 차트 */}
        <div className="flex justify-center">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="w-full max-w-[320px]"
          >
            {/* 그리드 (동심 오각형) */}
            {GRID_LEVELS.map((level) => {
              const r = (level / 100) * MAX_R;
              const pts = ANGLES.map((a) => {
                const p = polar(a, r);
                return `${p.x},${p.y}`;
              }).join(" ");
              return (
                <polygon
                  key={level}
                  points={pts}
                  fill="none"
                  stroke={level === 60 ? "#94a3b8" : "#e2e8f0"}
                  strokeWidth={level === 60 ? 1.2 : 0.8}
                  strokeDasharray={level === 60 ? "3,3" : undefined}
                />
              );
            })}

            {/* 축선 */}
            {ANGLES.map((angle, i) => {
              const outer = polar(angle, MAX_R);
              return (
                <line
                  key={i}
                  x1={CX} y1={CY}
                  x2={outer.x} y2={outer.y}
                  stroke="#e2e8f0"
                  strokeWidth={0.8}
                />
              );
            })}

            {/* 그리드 레벨 라벨 */}
            {[20, 40, 60, 80].map((level) => (
              <text
                key={level}
                x={CX + 3}
                y={CY - (level / 100) * MAX_R + 4}
                fontSize={8}
                fill="#94a3b8"
                textAnchor="start"
              >
                {level}
              </text>
            ))}

            {/* 점수 채움 폴리곤 */}
            <polygon
              points={polygonPoints(scores)}
              fill={gradeColor}
              fillOpacity={0.18}
              stroke={gradeColor}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />

            {/* 각 축 점 */}
            {scores.map((score, i) => {
              const r = (score / 100) * MAX_R;
              const p = polar(ANGLES[i], r);
              return (
                <circle
                  key={i}
                  cx={p.x} cy={p.y}
                  r={5}
                  fill={gradeColor}
                  stroke="white"
                  strokeWidth={1.5}
                />
              );
            })}

            {/* 축 레이블 */}
            {axisLabels.map((al, i) => {
              const anchor = Math.abs(ANGLES[i] + Math.PI / 2) < 0.3 ? "middle" : al.isLeft ? "end" : "start";
              return (
                <g key={i}>
                  <text
                    x={al.x}
                    y={al.y - 6}
                    textAnchor={anchor}
                    fontSize={11}
                    fontWeight="700"
                    fill="#1e293b"
                  >
                    {al.emoji} {al.label}
                  </text>
                  <text
                    x={al.x}
                    y={al.y + 8}
                    textAnchor={anchor}
                    fontSize={13}
                    fontWeight="800"
                    fill={gradeColor}
                  >
                    {al.score}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* 오른쪽: 축별 상세 + 트렌드 */}
        <div className="space-y-2.5">
          {result.axes.map((axis) => (
            <div key={axis.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{axis.emoji}</span>
                  <span className="text-xs font-bold text-slate-800">{axis.label}</span>
                  <span className="text-[10px] text-slate-400">{CONFIDENCE_DOT[axis.confidence]}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${axis.score}%`,
                        backgroundColor: axis.score >= 65 ? "#10b981" : axis.score >= 40 ? "#f59e0b" : "#ef4444",
                      }}
                    />
                  </div>
                  <span
                    className="text-sm font-extrabold tabular-nums w-7 text-right"
                    style={{ color: axis.score >= 65 ? "#10b981" : axis.score >= 40 ? "#d97706" : "#ef4444" }}
                  >
                    {axis.score}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-tight mb-1.5">{axis.detail}</p>
              {axis.subScores && axis.subScores.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {axis.subScores.map((s) => (
                    <span key={s.label} className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">
                      {s.label}: <strong>{s.value}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* e커머스 플랫폼 지표 */}
      {(ecommerce?.oliveYoung || ecommerce?.coupang) && (
        <div className="rounded-xl border border-slate-200 p-4 bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="text-xs font-bold text-slate-800 mb-3">🛍️ e커머스 플랫폼 현황</div>
          <div className="grid grid-cols-2 gap-3">
            {ecommerce.oliveYoung && (
              <div className="bg-white rounded-lg border border-green-100 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-sm">🌿</span>
                  <span className="text-xs font-bold text-slate-700">올리브영</span>
                  {ecommerce.oliveYoung.isInBest && (
                    <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">BEST</span>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">등록 상품</span>
                    <span className="font-bold text-slate-800">{ecommerce.oliveYoung.productCount.toLocaleString()}개</span>
                  </div>
                  {ecommerce.oliveYoung.bestRank && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">베스트 순위</span>
                      <span className="font-bold text-emerald-600">{ecommerce.oliveYoung.bestRank}위</span>
                    </div>
                  )}
                  {ecommerce.oliveYoung.topReviews > 0 && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">리뷰 합계</span>
                      <span className="font-bold text-slate-800">{ecommerce.oliveYoung.topReviews.toLocaleString()}개</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {ecommerce.coupang && (
              <div className="bg-white rounded-lg border border-amber-100 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-sm">🛒</span>
                  <span className="text-xs font-bold text-slate-700">쿠팡</span>
                  {ecommerce.coupang.rocketDeliveryCount > 0 && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">로켓</span>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">검색 상품</span>
                    <span className="font-bold text-slate-800">{ecommerce.coupang.productCount.toLocaleString()}개</span>
                  </div>
                  {ecommerce.coupang.avgRating > 0 && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">평균 평점</span>
                      <span className="font-bold text-amber-600">★ {ecommerce.coupang.avgRating}</span>
                    </div>
                  )}
                  {ecommerce.coupang.totalReviews > 0 && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">리뷰 합계</span>
                      <span className="font-bold text-slate-800">{ecommerce.coupang.totalReviews.toLocaleString()}개</span>
                    </div>
                  )}
                  {ecommerce.coupang.rocketDeliveryCount > 0 && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">로켓배송</span>
                      <span className="font-bold text-slate-800">{ecommerce.coupang.rocketDeliveryCount}개</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 트렌드 섹션 */}
      {trendData && (
        <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 p-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <div className="text-xs font-bold text-slate-800 mb-0.5">
                📊 검색 트렌드 — "{trendData.keyword}"
                <span className="ml-2 text-[10px] font-normal text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">
                  {trendData.source === "datalab" ? "네이버 DataLab" : trendData.source === "shopping" ? "쇼핑인사이트" : "뉴스 추정"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <span>현재 지수: <strong className="text-slate-900">{trendData.currentScore}</strong></span>
                <span className={`font-bold ${trendData.trendDelta > 0 ? "text-emerald-600" : trendData.trendDelta < 0 ? "text-red-500" : "text-slate-500"}`}>
                  {trendData.trendLabel} {trendData.trendDelta > 0 ? "▲" : trendData.trendDelta < 0 ? "▼" : "—"}
                  {Math.abs(trendData.trendDelta)}% (전년 대비)
                </span>
              </div>
            </div>
            <Sparkline points={trendData.points} />
          </div>
        </div>
      )}

      {/* 종합 판단 */}
      <div
        className="rounded-xl p-4 text-sm font-semibold border"
        style={{ borderColor: gradeColor + "40", background: gradeColor + "10", color: "#1e293b" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">{result.grade === "S" ? "🏆" : result.grade === "A" ? "✅" : result.grade === "B" ? "📋" : result.grade === "C" ? "⚠️" : "🚨"}</span>
          <span className="font-extrabold" style={{ color: gradeColor }}>{result.gradeLabel}</span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">{result.summary}</p>
        <p className="text-[10px] text-slate-400 mt-2">
          🟢 확인된 데이터 · 🟡 추정 데이터 · ⚪ 데이터 없음 — 투자 판단 전 반드시 원문 검증 필요
        </p>
      </div>
    </div>
  );
}
