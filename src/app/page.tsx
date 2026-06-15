"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Sparkles, Target, Handshake, ShoppingCart, TrendingUp } from "lucide-react";
import { PURPOSE_LABELS } from "@/lib/types";
import type { ResearchPurpose } from "@/lib/types";

const PURPOSE_ICONS: Record<ResearchPurpose, React.ComponentType<any>> = {
  investment: TrendingUp,
  jbp: Handshake,
  ma: Target,
  sourcing: ShoppingCart,
};

const SUGGESTIONS = ["에이피알", "비나우", "메디큐브", "무신사", "머스트잇", "엔라이즈"];

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState<ResearchPurpose>("investment");
  const [health, setHealth] = useState<{ dart_key: boolean; naver_key: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setSubmitting(true);
    router.push(`/dashboard?q=${encodeURIComponent(query.trim())}&purpose=${purpose}`);
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-pink-50 -z-10" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-radial from-brand-100/40 to-transparent rounded-full blur-3xl -z-10" />

      <main className="max-w-3xl mx-auto px-4 pt-12 sm:pt-20 pb-16">
        {/* Header */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/80 backdrop-blur border border-slate-200 rounded-full text-xs font-semibold text-slate-600 shadow-sm mb-6">
            <Sparkles className="w-3.5 h-3.5 text-brand-500" />
            CJ ENM 성장추진팀 · 브랜드 리서치 워크벤치
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 mb-3">
            한 번의 검색으로
            <span className="block bg-gradient-to-r from-brand-600 to-pink-500 bg-clip-text text-transparent">
              기업 전체를 파악합니다
            </span>
          </h1>
          <p className="text-sm sm:text-base text-slate-600 max-w-md mx-auto">
            재무 · 투자 · 고용 · 사업자 정보를 공공·무료 데이터에서 자동 수집해 컨설팅 리서치 수준의 대시보드로 정리합니다.
          </p>
        </div>

        {/* Search Card */}
        <form onSubmit={submit} className="card animate-slide-up p-5 sm:p-7 space-y-5">
          {/* 검색창 */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="브랜드명 또는 법인명을 입력하세요 (예: 에이피알, 메디큐브)"
              autoFocus
              className="w-full pl-12 pr-4 py-4 text-base sm:text-lg bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-brand-500 focus:bg-white transition"
            />
          </div>

          {/* 빠른 제안 */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-500 self-center">빠른 시도:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="px-3 py-1 text-xs bg-slate-100 hover:bg-brand-100 hover:text-brand-700 rounded-full transition"
              >
                {s}
              </button>
            ))}
          </div>

          {/* 조사 목적 */}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">조사 목적</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(PURPOSE_LABELS) as ResearchPurpose[]).map((p) => {
                const Icon = PURPOSE_ICONS[p];
                const meta = PURPOSE_LABELS[p];
                const active = purpose === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPurpose(p)}
                    className={[
                      "relative flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition",
                      active
                        ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                        : "border-slate-200 hover:border-slate-300 bg-white",
                    ].join(" ")}
                  >
                    <Icon className={`w-5 h-5 ${active ? "text-brand-600" : "text-slate-400"}`} />
                    <div className={`font-semibold text-sm ${active ? "text-brand-700" : "text-slate-900"}`}>
                      {meta.label}
                    </div>
                    <div className="text-[11px] text-slate-500 leading-snug">{meta.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CTA */}
          <button type="submit" disabled={!query.trim() || submitting} className="btn-primary w-full py-3.5 text-base">
            {submitting ? "분석 페이지로 이동 중..." : (
              <>
                분석 시작 <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* API 상태 */}
          {health && (
            <div className="flex items-center justify-center gap-3 pt-2 border-t border-slate-100 text-xs">
              <span className={`pill ${health.dart_key ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {health.dart_key ? "✓" : "✗"} DART
              </span>
              <span className={`pill ${health.naver_key ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {health.naver_key ? "✓" : "✗"} 네이버
              </span>
              <span className="text-slate-500">자동수집 ·  나머지는 1클릭 외부 링크</span>
            </div>
          )}
        </form>

        {/* 안내 */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
          {[
            { t: "공공 데이터 우선", d: "DART · 네이버 · 공정위 · 중기부 등 무료 공개 데이터만 사용" },
            { t: "목적별 최적화", d: "투자/제휴/M&A/소싱에 따라 우선 노출 데이터 자동 조정" },
            { t: "1클릭 외부 검색", d: "혁신의숲 · THE VC · 사람인 등 14개 사이트 일괄 오픈" },
          ].map((x) => (
            <div key={x.t} className="card p-4">
              <div className="font-semibold text-slate-900 mb-1">{x.t}</div>
              <div className="text-slate-500 leading-relaxed">{x.d}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
