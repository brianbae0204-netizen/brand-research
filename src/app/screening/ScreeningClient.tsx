"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList, Loader2, Building2, AlertTriangle, LayoutDashboard } from "lucide-react";
import type { DartCorp, ScreeningResult, SearchResult } from "@/lib/types";
import { ScreeningReport } from "@/components/ScreeningReport";

export default function ScreeningClient() {
  const params = useSearchParams();
  const router = useRouter();
  const query = params.get("q") || "";
  const purpose = params.get("purpose") || "investment";
  const initialCorp = params.get("corp_code") || "";

  const [candidates, setCandidates] = useState<DartCorp[]>([]);
  const [selected, setSelected] = useState<string>(initialCorp);
  const [searchLoaded, setSearchLoaded] = useState(false);
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // DART 후보 (선택 UI 용)
  useEffect(() => {
    if (!query) return;
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d: SearchResult) => {
        setCandidates(d.dart_candidates || []);
        if (!initialCorp && d.dart_candidates?.length > 0) setSelected(d.dart_candidates[0].corp_code);
      })
      .catch(() => {})
      .finally(() => setSearchLoaded(true));
  }, [query, initialCorp]);

  // 스크리닝 수집 — 검색 완료 후, 후보가 있으면 선택된 뒤에만 호출 (레이스 방지)
  useEffect(() => {
    if (!query || !searchLoaded) return;
    if (candidates.length > 0 && !selected) return;
    let stale = false;
    setLoading(true);
    setError(null);
    fetch(`/api/screening?corp_code=${selected}&q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => {
        if (stale) return;
        if (d.error) setError(d.error);
        else setResult(d as ScreeningResult);
      })
      .catch((e) => !stale && setError(String(e)))
      .finally(() => !stale && setLoading(false));
    return () => { stale = true; };
  }, [query, selected, candidates.length, searchLoaded]);

  if (!query) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-500">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          검색어가 없습니다. <button onClick={() => router.push("/")} className="text-brand-600 underline">홈에서 검색</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <button onClick={() => router.push("/")} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium">
            <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">새 검색</span>
          </button>
          <div className="flex-1 min-w-0 text-center">
            <div className="font-extrabold text-base sm:text-lg text-slate-900 truncate flex items-center justify-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-brand-500" /> 투자 스크리닝
            </div>
            <div className="text-[11px] text-slate-500 truncate">{result?.corp_name || query}{result?.brand ? ` · 브랜드 ${result.brand}` : ""}</div>
          </div>
          <button
            onClick={() => router.push(`/dashboard?q=${encodeURIComponent(query)}&purpose=${purpose}`)}
            className="btn-ghost text-xs sm:text-sm inline-flex items-center gap-1"
          >
            <LayoutDashboard className="w-4 h-4" /><span className="hidden sm:inline">대시보드</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* DART 후보 선택 */}
        {candidates.length > 0 && (
          <section className="card p-4">
            <h2 className="section-title mb-3"><Building2 className="w-4 h-4" /> DART 등록 회사</h2>
            <div className="flex flex-wrap gap-2">
              {candidates.map((c) => (
                <button
                  key={c.corp_code}
                  onClick={() => setSelected(c.corp_code)}
                  className={`px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition ${
                    selected === c.corp_code ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 hover:border-slate-300 text-slate-700"
                  }`}
                >
                  {c.corp_name}
                  {c.is_listed && <span className="ml-1.5 text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded">상장</span>}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* AI 안내 */}
        {result && !result.aiEnabled && (
          <div className="card p-3 bg-amber-50 border-amber-200 text-xs text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Gemini 키 미설정 — 공시/검색 확정값만 표시되고 추정 항목은 "정보 없음·실사 필요"로 나옵니다.
          </div>
        )}

        {/* 상태 */}
        {loading ? (
          <div className="card p-12 text-center text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin mx-auto mb-2" />
            6개 카테고리 수집 중... <div className="text-xs text-slate-400 mt-1">DART · 네이버 · Gemini</div>
          </div>
        ) : error ? (
          <div className="card p-6 bg-rose-50 border-rose-200 text-sm text-rose-700">
            <div className="font-bold mb-1">수집 오류</div>{error}
          </div>
        ) : result ? (
          <ScreeningReport result={result} />
        ) : (
          <div className="card p-10 text-center text-slate-500 text-sm">표시할 데이터가 없습니다.</div>
        )}

        <footer className="text-center text-xs text-slate-400 py-6">
          DART·네이버 확정값 우선 + 부족분 Gemini 추정 · 모든 추정치는 실사 검증 필요 · CJ ENM 성장추진팀
        </footer>
      </main>
    </div>
  );
}
