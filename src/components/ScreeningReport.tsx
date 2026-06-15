import type { DataConfidence, ScreeningResult, ScreeningField } from "@/lib/types";

const CONF: Record<DataConfidence, { label: string; cls: string }> = {
  confirmed: { label: "공식", cls: "bg-emerald-100 text-emerald-700" },
  estimated: { label: "AI 추정·검증필요", cls: "bg-amber-100 text-amber-700" },
  unknown: { label: "정보없음·실사", cls: "bg-slate-100 text-slate-500" },
};

function Badge({ c }: { c: DataConfidence }) {
  const s = CONF[c];
  return <span className={`pill ${s.cls} text-[10px] whitespace-nowrap`}>{s.label}</span>;
}

function counts(fields: ScreeningField[]) {
  const c = { confirmed: 0, estimated: 0, unknown: 0 } as Record<DataConfidence, number>;
  fields.forEach((f) => (c[f.source.confidence] += 1));
  return c;
}

export function ScreeningReport({ result }: { result: ScreeningResult }) {
  return (
    <div className="space-y-4">
      {/* 범례 */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
        <span>신뢰도:</span>
        <Badge c="confirmed" /> <span>API·공시 확정</span>
        <Badge c="estimated" /> <span>Gemini 추정(검증필요)</span>
        <Badge c="unknown" /> <span>근거 없음 → 실사 필요</span>
      </div>

      {result.categories.map((cat) => {
        const c = counts(cat.fields);
        return (
          <details key={cat.id} open className="card overflow-hidden group">
            <summary className="cursor-pointer list-none px-4 sm:px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <span className="font-bold text-slate-800 flex items-center gap-2">
                <span className="text-lg">{cat.emoji}</span>
                {cat.title}
                <span className="text-[11px] font-normal text-slate-400">({cat.fields.length}개 항목)</span>
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="text-emerald-600 font-semibold">공식 {c.confirmed}</span>
                <span className="text-amber-600 font-semibold">추정 {c.estimated}</span>
                <span>없음 {c.unknown}</span>
                <span className="ml-1 transition-transform group-open:rotate-180">▾</span>
              </span>
            </summary>
            <div className="divide-y divide-slate-100">
              {cat.fields.map((f, i) => (
                <div key={i} className="px-4 sm:px-5 py-3 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-1 sm:gap-3 items-start">
                  <div className="text-xs font-semibold text-slate-500 pt-0.5">{f.label}</div>
                  <div className="flex items-start justify-between gap-2">
                    <div className={`text-sm break-words ${f.source.confidence === "unknown" ? "text-slate-400" : "text-slate-800"}`}>
                      {f.value}
                      {f.source.verifyUrl && f.source.confidence === "confirmed" && (
                        <a href={f.source.verifyUrl} target="_blank" rel="noopener" className="ml-1.5 text-[10px] text-brand-600 hover:underline">↗</a>
                      )}
                    </div>
                    <Badge c={f.source.confidence} />
                  </div>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
