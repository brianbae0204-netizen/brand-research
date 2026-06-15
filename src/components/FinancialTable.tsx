"use client";

import type { FinancialSummaryRow } from "@/lib/types";

const ROWS: { key: string; label: string; group: "pnl" | "bs" | "cf"; highlight?: boolean }[] = [
  { key: "매출액", label: "매출액", group: "pnl", highlight: true },
  { key: "매출원가", label: "매출원가", group: "pnl" },
  { key: "매출총이익", label: "매출총이익", group: "pnl" },
  { key: "영업이익", label: "영업이익", group: "pnl", highlight: true },
  { key: "당기순이익", label: "당기순이익", group: "pnl", highlight: true },
  { key: "자산총계", label: "자산총계", group: "bs" },
  { key: "부채총계", label: "부채총계", group: "bs" },
  { key: "자본총계", label: "자본총계", group: "bs" },
  { key: "현금성자산", label: "현금성자산", group: "bs" },
  { key: "영업활동현금흐름", label: "영업활동 CF", group: "cf", highlight: true },
  { key: "투자활동현금흐름", label: "투자활동 CF", group: "cf" },
  { key: "재무활동현금흐름", label: "재무활동 CF", group: "cf" },
];

const GROUP_LABEL: Record<string, string> = {
  pnl: "💰 손익계산서",
  bs: "📊 재무상태표",
  cf: "💵 현금흐름표",
};

function fmt(v: number | null) {
  if (v === null || v === undefined) return "-";
  const m = v / 1_000_000;
  if (Math.abs(m) >= 100_000) return `${(m / 10_000).toFixed(1)}조`;
  if (Math.abs(m) >= 100) return `${Math.round(m).toLocaleString()}백만`;
  return `${m.toFixed(1)}백만`;
}

function growth(curr: number | null, prev: number | null) {
  if (curr === null || prev === null || prev === 0) return null;
  const g = ((curr - prev) / Math.abs(prev)) * 100;
  return g;
}

export function FinancialTable({ summary }: { summary: FinancialSummaryRow[] }) {
  if (!summary || summary.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-500 text-sm">
        📭 공시된 재무제표가 없습니다 (비상장 미공시 또는 자료 누락)
      </div>
    );
  }
  const sorted = [...summary].sort((a, b) => a.year - b.year);

  return (
    <div className="space-y-4">
      {(["pnl", "bs", "cf"] as const).map((g) => (
        <div key={g} className="card overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
            <div className="text-sm font-bold text-slate-700">{GROUP_LABEL[g]}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white border-b border-slate-200">
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600 text-xs">항목</th>
                  {sorted.map((s) => (
                    <th key={s.year} className="text-right px-4 py-2.5 font-semibold text-slate-600 text-xs">
                      {s.year}<span className="text-[10px] text-slate-400 font-normal ml-1">{s.fs_div === "CFS" ? "연결" : "별도"}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.filter((r) => r.group === g).map((r) => {
                  let prev: number | null = null;
                  return (
                    <tr key={r.key} className={`border-b border-slate-100 last:border-0 ${r.highlight ? "bg-amber-50/40" : ""}`}>
                      <td className={`px-4 py-2.5 ${r.highlight ? "font-bold text-slate-900" : "text-slate-700"}`}>
                        {r.label}
                      </td>
                      {sorted.map((s) => {
                        const v = s.values[r.key];
                        const gr = growth(v, prev);
                        prev = v;
                        return (
                          <td key={s.year} className="px-4 py-2.5 text-right tabular-nums">
                            <div className={r.highlight ? "font-bold text-slate-900" : "text-slate-800"}>{fmt(v)}</div>
                            {gr !== null && (
                              <div className={`text-[10px] font-semibold ${gr >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {gr >= 0 ? "▲" : "▼"} {Math.abs(gr).toFixed(1)}%
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
