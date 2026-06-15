"use client";

import type { FinancialSummaryRow } from "@/lib/types";

const METRICS = [
  { key: "매출액", label: "매출액", color: "#6366f1" },
  { key: "영업이익", label: "영업이익", color: "#10b981" },
  { key: "당기순이익", label: "당기순이익", color: "#f59e0b" },
] as const;

/** 원 → 억/조 라벨 */
function fmtEok(v: number | null): string {
  if (v === null || v === undefined) return "-";
  const eok = v / 1e8;
  if (Math.abs(eok) >= 10000) return `${(eok / 10000).toFixed(1)}조`;
  if (Math.abs(eok) >= 1) return `${Math.round(eok).toLocaleString()}억`;
  return `${(v / 1e4).toFixed(0)}만`;
}

export function FinancialChart({ summary }: { summary: FinancialSummaryRow[] }) {
  const rows = [...summary].sort((a, b) => a.year - b.year);
  if (rows.length === 0) return null;

  // 모든 값에서 최대 절대값 (스케일 기준)
  let maxAbs = 0;
  for (const r of rows) {
    for (const m of METRICS) {
      const v = r.values[m.key];
      if (v !== null && v !== undefined) maxAbs = Math.max(maxAbs, Math.abs(v));
    }
  }
  if (maxAbs === 0) maxAbs = 1;

  // 레이아웃
  const W = 720, H = 300;
  const padL = 16, padR = 16, padT = 24, padB = 56;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const hasNeg = rows.some((r) => METRICS.some((m) => (r.values[m.key] ?? 0) < 0));
  const zeroY = padT + (hasNeg ? plotH / 2 : plotH);
  const usableH = hasNeg ? plotH / 2 : plotH;

  const groupW = plotW / rows.length;
  const barGap = 8;
  const barW = Math.min(46, (groupW - barGap * (METRICS.length + 1)) / METRICS.length);

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="text-sm font-bold text-slate-700">📈 3개년 손익 추이</div>
        <div className="flex items-center gap-3 text-[11px]">
          {METRICS.map((m) => (
            <span key={m.key} className="inline-flex items-center gap-1 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: m.color }} />
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="3개년 손익 막대그래프">
        {/* 0 기준선 */}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#cbd5e1" strokeWidth="1" />

        {rows.map((r, gi) => {
          const gx = padL + groupW * gi;
          return (
            <g key={r.year}>
              {METRICS.map((m, mi) => {
                const v = r.values[m.key];
                const cx = gx + barGap + mi * (barW + barGap);
                if (v === null || v === undefined) {
                  return (
                    <text key={m.key} x={cx + barW / 2} y={zeroY - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">-</text>
                  );
                }
                const h = (Math.abs(v) / maxAbs) * usableH;
                const y = v >= 0 ? zeroY - h : zeroY;
                return (
                  <g key={m.key}>
                    <rect x={cx} y={y} width={barW} height={Math.max(1, h)} rx="3" fill={m.color} opacity="0.9" />
                    <text
                      x={cx + barW / 2}
                      y={v >= 0 ? y - 4 : y + h + 11}
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="600"
                      fill={v >= 0 ? "#475569" : "#e11d48"}
                    >
                      {fmtEok(v)}
                    </text>
                  </g>
                );
              })}
              {/* 연도 라벨 */}
              <text x={gx + groupW / 2} y={H - padB + 28} textAnchor="middle" fontSize="12" fontWeight="700" fill="#334155">
                {r.year}
                <tspan fontSize="9" fontWeight="400" fill="#94a3b8"> {r.fs_div === "CFS" ? "연결" : "별도"}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <div className="text-[10px] text-slate-400 text-right mt-1">단위: 억원 · 출처 DART</div>
    </div>
  );
}
