import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  subValue,
  trend,
  icon,
}: {
  label: string;
  value: string;
  subValue?: string;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  icon?: ReactNode;
}) {
  const trendColor =
    trend?.direction === "up"
      ? "text-emerald-600"
      : trend?.direction === "down"
      ? "text-rose-600"
      : "text-slate-500";
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">{value}</div>
        {trend && (
          <span className={`text-xs font-bold tabular-nums ${trendColor}`}>
            {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "—"} {trend.value}
          </span>
        )}
      </div>
      {subValue && <div className="text-xs text-slate-500 mt-1">{subValue}</div>}
    </div>
  );
}
