import type { DataSource } from "@/lib/types";
import { CheckCircle2, ExternalLink } from "lucide-react";

export function DataSourceCard({ source }: { source: DataSource }) {
  const isAuto = source.category === "auto";
  return (
    <div className="card card-hover p-4 sm:p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{source.emoji}</span>
          <div>
            <div className="font-bold text-slate-900 text-sm sm:text-base">{source.title}</div>
            <span
              className={`pill mt-1 ${
                isAuto ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {isAuto ? "● 자동 수집" : "○ 외부 확인"}
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed mb-3">{source.description}</p>

      <ul className="space-y-1.5 mb-4 flex-1">
        {source.checklist.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[12px] text-slate-700 leading-snug">
            <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center justify-center gap-1.5 w-full py-2 bg-slate-50 hover:bg-brand-50 hover:text-brand-700 text-slate-700 text-xs font-semibold rounded-lg transition border border-slate-200"
        >
          사이트에서 확인 <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}
