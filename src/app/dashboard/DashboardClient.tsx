"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, AlertTriangle, FileText, Loader2,
  BarChart3, Newspaper, ShoppingBag, PenLine, Sparkles, Database, ExternalLink, ClipboardList,
} from "lucide-react";
import type {
  SearchResult, FinancialSummaryRow, DartCorp, ResearchPurpose,
  CompanyOverview, NewsItem, ShoppingItem, FinancialAnalysis,
} from "@/lib/types";
import { PURPOSE_LABELS } from "@/lib/types";
import { StatCard } from "@/components/StatCard";
import { FinancialTable } from "@/components/FinancialTable";
import { FinancialChart } from "@/components/FinancialChart";
import { DataSourceCard } from "@/components/DataSourceCard";
import { CompanyOverviewCard } from "@/components/CompanyOverview";
import { BrandScoreChart } from "@/components/BrandScoreChart";
import type { BrandScoreResult } from "@/lib/brandscore";

function fmtKR(v: number | null | undefined) {
  if (v === null || v === undefined) return "-";
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}조`;
  if (a >= 1e8) return `${(v / 1e8).toFixed(0)}억`;
  if (a >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
  return v.toLocaleString();
}

function fmtPct(curr: number | null, prev: number | null) {
  if (curr === null || prev === null || !prev) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/** 브랜드 기준 검색 표기 */
function BrandTag({ brand }: { brand: string | null }) {
  if (!brand) return null;
  return <span className="pill bg-pink-50 text-pink-600 text-[11px]">브랜드 ‘{brand}’ 기준</span>;
}

export default function DashboardClient() {
  const params = useSearchParams();
  const router = useRouter();
  const query = params.get("q") || "";
  const purpose = (params.get("purpose") || "investment") as ResearchPurpose;
  const userBrands = params.get("brands") || "";

  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCorp, setSelectedCorp] = useState<DartCorp | null>(null);
  const [financials, setFinancials] = useState<FinancialSummaryRow[]>([]);
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [blog, setBlog] = useState<NewsItem[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [brand, setBrand] = useState<string | null>(null);
  const [finAnalysis, setFinAnalysis] = useState<FinancialAnalysis | null>(null);
  const [finLoading, setFinLoading] = useState(false);
  const [brandScore, setBrandScore] = useState<BrandScoreResult | null>(null);
  const [brandTrend, setBrandTrend] = useState<any>(null);
  const [brandEcommerce, setBrandEcommerce] = useState<any>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  // 초기 검색 (DART 후보)
  useEffect(() => {
    if (!query) return;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(query)}&purpose=${purpose}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: SearchResult) => {
        setData(d);
        if (d.dart_candidates?.length > 0) setSelectedCorp(d.dart_candidates[0]);
      })
      .finally(() => setLoading(false));
  }, [query, purpose]);

  // 개요 통합 조회 (브랜드 기준 뉴스/쇼핑/블로그 + 재무 + AI)
  useEffect(() => {
    if (!query || !data) return;
    // 후보가 있는데 아직 미선택이면 자동선택 후 재실행되므로 대기
    if (data.dart_candidates.length > 0 && !selectedCorp) return;
    const cc = selectedCorp?.corp_code || "";
    setFinLoading(true);
    const brandsParam = userBrands ? `&brands=${encodeURIComponent(userBrands)}` : "";
    fetch(`/api/overview?corp_code=${cc}&q=${encodeURIComponent(query)}${brandsParam}&_=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setOverview(d.overview || null);
        setFinancials(d.summary || []);
        setNews(d.news || []);
        setBlog(d.blog || []);
        setShopping(d.shopping || []);
        setBrand(d.brand || null);
        setFinAnalysis(d.financialAnalysis || null);
      })
      .finally(() => setFinLoading(false));
  }, [query, selectedCorp, data, userBrands]);

  // 브랜드 점수 — 개요 데이터가 로드된 후 별도 요청
  useEffect(() => {
    if (!query || finLoading) return;
    setScoreLoading(true);
    const cc = selectedCorp?.corp_code || "";
    const brandParam = brand ? `&brand=${encodeURIComponent(brand)}` : "";
    fetch(`/api/brand-score?q=${encodeURIComponent(query)}&corp_code=${cc}${brandParam}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.axes) setBrandScore(d);
        if (d.trend) setBrandTrend(d.trend);
        if (d.ecommerce) setBrandEcommerce(d.ecommerce);
      })
      .catch(() => {})
      .finally(() => setScoreLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedCorp, finLoading]);

  const kpi = useMemo(() => {
    if (!financials || financials.length === 0) return null;
    const sorted = [...financials].sort((a, b) => a.year - b.year);
    const latest = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    const rev = latest?.values["매출액"] ?? null;
    const op = latest?.values["영업이익"] ?? null;
    const ni = latest?.values["당기순이익"] ?? null;
    const ocf = latest?.values["영업활동현금흐름"] ?? null;
    return {
      rev, op, ni, ocf,
      revGrowth: prev ? fmtPct(rev, prev.values["매출액"]) : null,
      opGrowth: prev ? fmtPct(op, prev.values["영업이익"]) : null,
      year: latest.year,
      opMargin: rev && op ? (op / rev) * 100 : null,
    };
  }, [financials]);

  const purposeMeta = PURPOSE_LABELS[purpose] ?? PURPOSE_LABELS.investment;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto mb-3" />
          <div className="text-sm text-slate-600">데이터 수집 중...</div>
          <div className="text-xs text-slate-400 mt-1">DART · 네이버 · 공공데이터</div>
        </div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Nav */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <button onClick={() => router.push("/")} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">새 검색</span>
          </button>
          <div className="flex-1 min-w-0 text-center">
            <div className="font-extrabold text-base sm:text-lg text-slate-900 truncate">{data.query}</div>
            <div className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
              <span>{purposeMeta.emoji} {purposeMeta.label}</span>
              <span>·</span>
              <span>{new Date(data.timestamp).toLocaleString("ko-KR")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/screening?q=${encodeURIComponent(query)}&purpose=${purpose}${selectedCorp ? `&corp_code=${selectedCorp.corp_code}` : ""}`)}
              className="btn-primary text-xs sm:text-sm inline-flex items-center gap-1 py-1.5"
            >
              <ClipboardList className="w-4 h-4" /><span className="hidden sm:inline">투자 스크리닝</span>
            </button>
            <button onClick={() => window.print()} className="btn-ghost text-xs sm:text-sm">
              🖨️ <span className="hidden sm:inline">인쇄</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* AI 브랜드 → 법인 자동 매핑 알림 */}
        {data.mappedFrom && (
          <section className="rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <div className="font-semibold text-violet-900 mb-1">
                  AI 자동 매핑: 「{data.mappedFrom.input}」 → 「{data.mappedFrom.mappedTo}」
                  <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">
                    confidence: {data.mappedFrom.confidence}
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed">{data.mappedFrom.reason}</p>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  💡 입력하신 브랜드명이 DART 등록명과 달라 AI가 운영 법인을 추정했습니다. 아래에 DART 후보가 표시됩니다.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* DART 후보 선택 */}
        {data.dart_candidates.length > 0 && (
          <section className="card p-4 sm:p-5">
            <h2 className="section-title mb-3"><Building2 className="w-4 h-4" /> DART 등록 회사</h2>
            <div className="flex flex-wrap gap-2">
              {data.dart_candidates.map((c) => (
                <button
                  key={c.corp_code}
                  onClick={() => setSelectedCorp(c)}
                  className={`px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition ${
                    selectedCorp?.corp_code === c.corp_code
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 hover:border-slate-300 text-slate-700"
                  }`}
                >
                  {c.corp_name}
                  {c.is_listed && <span className="ml-1.5 text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded">상장</span>}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 기업 개요 */}
        {finLoading && !overview ? (
          <section className="card p-10 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            기업 개요 수집 중... <span className="text-xs text-slate-400">(DART · 국민연금 · 뉴스 · AI)</span>
          </section>
        ) : (
          overview && <CompanyOverviewCard ov={overview} />
        )}

        {/* KPI */}
        {kpi && (
          <section>
            <h2 className="section-title mb-3"><BarChart3 className="w-4 h-4" /> 핵심 지표 ({kpi.year})</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="매출액" value={fmtKR(kpi.rev)}
                trend={kpi.revGrowth !== null ? { value: `${Math.abs(kpi.revGrowth).toFixed(1)}%`, direction: kpi.revGrowth >= 0 ? "up" : "down" } : undefined} />
              <StatCard label="영업이익" value={fmtKR(kpi.op)}
                subValue={kpi.opMargin !== null ? `OPM ${kpi.opMargin.toFixed(1)}%` : undefined}
                trend={kpi.opGrowth !== null ? { value: `${Math.abs(kpi.opGrowth).toFixed(1)}%`, direction: kpi.opGrowth >= 0 ? "up" : "down" } : undefined} />
              <StatCard label="당기순이익" value={fmtKR(kpi.ni)} />
              <StatCard label="영업활동 현금흐름" value={fmtKR(kpi.ocf)} />
            </div>
          </section>
        )}

        {/* 브랜드 투자 평가 지표 (오각형 레이더 차트) */}
        {scoreLoading && !brandScore ? (
          <section className="card p-10 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            투자 평가 지표 계산 중... <span className="text-xs text-slate-400">(재무·트렌드·브랜드파워 종합)</span>
          </section>
        ) : brandScore ? (
          <section>
            <BrandScoreChart
              result={brandScore}
              trendData={brandTrend}
              ecommerce={brandEcommerce}
              corpName={data.query}
            />
          </section>
        ) : null}

        {/* 재무제표 */}
        {selectedCorp && (
          <section>
            <h2 className="section-title mb-3"><FileText className="w-4 h-4" /> 3개년 재무제표</h2>
            {finLoading ? (
              <div className="card p-10 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />조회 중...</div>
            ) : financials.length > 0 ? (
              <div className="space-y-4">
                {finAnalysis && (
                  <div className="card p-4 bg-indigo-50/50 border-indigo-200">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 mb-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> AI 재무 분석
                      <span className="pill bg-amber-100 text-amber-700 text-[10px]">추정·검증필요</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{finAnalysis.text}</p>
                  </div>
                )}
                <FinancialChart summary={financials} />
                <FinancialTable summary={financials} />
              </div>
            ) : (
              <FinancialTable summary={financials} />
            )}
          </section>
        )}

        {/* 뉴스 */}
        {news.length > 0 && (
          <section>
            <h2 className="section-title mb-3 flex-wrap gap-2"><Newspaper className="w-4 h-4" /> 최근 뉴스 <BrandTag brand={brand} /></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {news.map((n, i) => (
                <a key={i} href={n.url} target="_blank" rel="noopener" className="card card-hover p-4 block">
                  <div className="text-sm font-semibold text-slate-900 mb-1.5 line-clamp-2">{n.title}</div>
                  <div className="text-[11px] text-slate-500 mb-1.5">{n.date && new Date(n.date).toLocaleDateString("ko-KR")}</div>
                  <div className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{n.desc}</div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* 쇼핑 */}
        {shopping.length > 0 && (
          <section>
            <h2 className="section-title mb-3 flex-wrap gap-2"><ShoppingBag className="w-4 h-4" /> 국내 e커머스 노출 <BrandTag brand={brand} /></h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {shopping.slice(0, 12).map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noopener" className="card card-hover overflow-hidden block">
                  <div className="aspect-square bg-slate-100 overflow-hidden">
                    {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-2.5">
                    <div className="text-[11px] text-slate-700 line-clamp-2 h-8 leading-tight">{p.title}</div>
                    <div className="text-sm font-extrabold text-pink-600 mt-1.5 tabular-nums">{p.price.toLocaleString()}원</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">{p.mall}</div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* 블로그 */}
        {blog.length > 0 && (
          <section>
            <h2 className="section-title mb-3 flex-wrap gap-2"><PenLine className="w-4 h-4" /> 고객평 · 인플루언서 <BrandTag brand={brand} /></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {blog.map((b, i) => (
                <a key={i} href={b.url} target="_blank" rel="noopener" className="card card-hover p-4 block">
                  <div className="text-sm font-semibold text-slate-900 mb-1.5 line-clamp-2">{b.title}</div>
                  <div className="text-[11px] text-slate-500 mb-1.5">{b.blogger} · {b.date}</div>
                  <div className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{b.desc}</div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* 자동 수집 데이터 소스 카드 */}
        {data.data_sources.auto.length > 0 && (
          <section>
            <h2 className="section-title mb-3"><Database className="w-4 h-4" /> 자동 수집 데이터 소스</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {data.data_sources.auto.map((s) => <DataSourceCard key={s.id} source={s} />)}
            </div>
          </section>
        )}

        {/* 외부 확인 (1클릭) */}
        {data.data_sources.external.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="section-title"><ExternalLink className="w-4 h-4" /> 외부 확인 필요 <span className="text-xs font-normal text-slate-500">({purposeMeta.label} 기준 정렬)</span></h2>
              <button
                onClick={openAllExternal(data.data_sources.external.map((s) => s.url || ""))}
                className="btn-ghost text-xs"
              >
                ⚡ 전체 새 탭 열기
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {data.data_sources.external.map((s) => <DataSourceCard key={s.id} source={s} />)}
            </div>
          </section>
        )}

        {/* 경고 — API 키 설정 안내 등 시스템 메시지는 숨기고 실제 수집 실패만 표시 */}
        {(() => {
          const uniqueWarnings = [...new Set(data.warnings)].filter(
            (w) => !w.includes("API 키가 설정되지 않아") && !w.includes("DATA_GO_KR_KEY")
          );
          return uniqueWarnings.length > 0 ? (
            <section className="card p-4 bg-amber-50 border-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-amber-900 mb-1">수집 한계</div>
                  <ul className="text-xs text-amber-800 space-y-0.5 list-disc list-inside">
                    {uniqueWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              </div>
            </section>
          ) : null;
        })()}

        <footer className="text-center text-xs text-slate-400 py-6">
          공공·무료 데이터(DART·국민연금·네이버) + AI 요약 기반 · CJ ENM 성장추진팀 · 수치·요약은 검증 필요
        </footer>
      </main>
    </div>
  );
}

function openAllExternal(urls: string[]) {
  return () => {
    if (!confirm(`${urls.length}개 외부 사이트를 새 탭으로 모두 엽니다.`)) return;
    urls.forEach((u, i) => u && setTimeout(() => window.open(u, "_blank"), i * 100));
  };
}
