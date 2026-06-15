"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, Calendar, User, Phone, Globe, MapPin,
  AlertTriangle, ExternalLink, FileText, Loader2, BarChart3, Newspaper,
  ShoppingBag, PenLine, Database, Sparkles,
} from "lucide-react";
import type { SearchResult, FinancialSummaryRow, DartCompanyInfo, DartCorp, ResearchPurpose } from "@/lib/types";
import { PURPOSE_LABELS } from "@/lib/types";
import { StatCard } from "@/components/StatCard";
import { FinancialTable } from "@/components/FinancialTable";
import { DataSourceCard } from "@/components/DataSourceCard";

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

export default function DashboardClient() {
  const params = useSearchParams();
  const router = useRouter();
  const query = params.get("q") || "";
  const purpose = (params.get("purpose") || "investment") as ResearchPurpose;

  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCorp, setSelectedCorp] = useState<DartCorp | null>(null);
  const [companyInfo, setCompanyInfo] = useState<DartCompanyInfo | null>(null);
  const [financials, setFinancials] = useState<FinancialSummaryRow[]>([]);
  const [finLoading, setFinLoading] = useState(false);

  // 초기 검색
  useEffect(() => {
    if (!query) return;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(query)}&purpose=${purpose}`)
      .then((r) => r.json())
      .then((d: SearchResult) => {
        setData(d);
        // DART 첫 후보 자동 선택
        if (d.dart_candidates?.length > 0) {
          setSelectedCorp(d.dart_candidates[0]);
        }
      })
      .finally(() => setLoading(false));
  }, [query, purpose]);

  // 회사 선택 시 재무 조회
  useEffect(() => {
    if (!selectedCorp) {
      setCompanyInfo(null);
      setFinancials([]);
      return;
    }
    setFinLoading(true);
    fetch(`/api/dart/financials?corp_code=${selectedCorp.corp_code}`)
      .then((r) => r.json())
      .then((d) => {
        setCompanyInfo(d.info || null);
        setFinancials(d.summary || []);
      })
      .finally(() => setFinLoading(false));
  }, [selectedCorp]);

  // KPI 계산
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
      rev,
      op,
      ni,
      ocf,
      revGrowth: prev ? fmtPct(rev, prev.values["매출액"]) : null,
      opGrowth: prev ? fmtPct(op, prev.values["영업이익"]) : null,
      year: latest.year,
      opMargin: rev && op ? (op / rev) * 100 : null,
    };
  }, [financials]);

  const purposeMeta = PURPOSE_LABELS[purpose];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto mb-3" />
          <div className="text-sm text-slate-600">데이터 수집 중...</div>
          <div className="text-xs text-slate-400 mt-1">DART · 네이버 뉴스/쇼핑/블로그</div>
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
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium"
          >
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
          <button
            onClick={() => window.print()}
            className="btn-ghost text-xs sm:text-sm"
          >
            🖨️ <span className="hidden sm:inline">인쇄</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

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

        {/* 회사 헤더 */}
        {companyInfo && (
          <section className="card p-5 sm:p-6 bg-gradient-to-br from-white to-slate-50">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-brand-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600">DART 회사 개황</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{companyInfo.corp_name}</h1>
                {companyInfo.corp_name_eng && (
                  <div className="text-sm text-slate-500 mt-0.5">{companyInfo.corp_name_eng}</div>
                )}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs sm:text-sm">
                  <InfoItem icon={<User />} label="대표자" value={companyInfo.ceo_nm} />
                  <InfoItem icon={<Calendar />} label="설립일" value={formatDate(companyInfo.est_dt)} />
                  <InfoItem icon={<FileText />} label="종목코드" value={companyInfo.stock_code || "비상장"} />
                  <InfoItem icon={<Calendar />} label="결산월" value={companyInfo.acc_mt ? `${companyInfo.acc_mt}월` : "-"} />
                  <InfoItem icon={<Phone />} label="대표 전화" value={companyInfo.phn_no} />
                  <InfoItem icon={<Globe />} label="홈페이지" value={companyInfo.hm_url} link />
                  <InfoItem icon={<MapPin />} label="주소" value={companyInfo.adres} className="col-span-2" />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* KPI */}
        {kpi && (
          <section>
            <h2 className="section-title mb-3"><BarChart3 className="w-4 h-4" /> 핵심 지표 ({kpi.year})</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="매출액"
                value={fmtKR(kpi.rev)}
                trend={kpi.revGrowth !== null ? {
                  value: `${Math.abs(kpi.revGrowth).toFixed(1)}%`,
                  direction: kpi.revGrowth >= 0 ? "up" : "down",
                } : undefined}
              />
              <StatCard
                label="영업이익"
                value={fmtKR(kpi.op)}
                subValue={kpi.opMargin !== null ? `OPM ${kpi.opMargin.toFixed(1)}%` : undefined}
                trend={kpi.opGrowth !== null ? {
                  value: `${Math.abs(kpi.opGrowth).toFixed(1)}%`,
                  direction: kpi.opGrowth >= 0 ? "up" : "down",
                } : undefined}
              />
              <StatCard label="당기순이익" value={fmtKR(kpi.ni)} />
              <StatCard label="영업활동 현금흐름" value={fmtKR(kpi.ocf)} />
            </div>
          </section>
        )}

        {/* 재무제표 */}
        {selectedCorp && (
          <section>
            <h2 className="section-title mb-3"><FileText className="w-4 h-4" /> 3개년 재무제표</h2>
            {finLoading ? (
              <div className="card p-10 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />조회 중...</div>
            ) : (
              <FinancialTable summary={financials} />
            )}
          </section>
        )}

        {/* 뉴스 */}
        {data.naver_news.length > 0 && (
          <section>
            <h2 className="section-title mb-3"><Newspaper className="w-4 h-4" /> 최근 뉴스 <span className="pill bg-slate-100 text-slate-600">네이버</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.naver_news.slice(0, 8).map((n, i) => (
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
        {data.naver_shopping.length > 0 && (
          <section>
            <h2 className="section-title mb-3"><ShoppingBag className="w-4 h-4" /> 국내 e커머스 노출 <span className="pill bg-slate-100 text-slate-600">네이버 쇼핑</span></h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {data.naver_shopping.slice(0, 12).map((p, i) => (
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
        {data.naver_blog.length > 0 && (
          <section>
            <h2 className="section-title mb-3"><PenLine className="w-4 h-4" /> 고객평 · 인플루언서 <span className="pill bg-slate-100 text-slate-600">네이버 블로그</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.naver_blog.slice(0, 6).map((b, i) => (
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
        <section>
          <h2 className="section-title mb-3"><Database className="w-4 h-4" /> 자동 수집 데이터 소스</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.data_sources.auto.map((s) => <DataSourceCard key={s.id} source={s} />)}
          </div>
        </section>

        {/* 외부 확인 (1클릭) */}
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

        {/* 경고 */}
        {data.warnings.length > 0 && (
          <section className="card p-4 bg-amber-50 border-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-amber-900 mb-1">수집 한계</div>
                <ul className="text-xs text-amber-800 space-y-0.5 list-disc list-inside">
                  {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            </div>
          </section>
        )}

        <footer className="text-center text-xs text-slate-400 py-6">
          공공·무료 데이터 기반 · CJ ENM 성장추진팀 · 비공개 재무·쿠팡 실시간 순위 등은 외부 링크로 보완
        </footer>
      </main>
    </div>
  );
}

function InfoItem({ icon, label, value, link, className }: {
  icon: React.ReactNode; label: string; value?: string; link?: boolean; className?: string;
}) {
  if (!value || value === "-") return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className="text-slate-400">-</div>
    </div>
  );
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
        <span className="w-3 h-3">{icon}</span>{label}
      </div>
      <div className="text-slate-800 font-medium break-all">
        {link ? <a href={value.startsWith("http") ? value : `http://${value}`} target="_blank" rel="noopener" className="text-brand-600 hover:underline">{value}</a> : value}
      </div>
    </div>
  );
}

function formatDate(d?: string) {
  if (!d || d.length < 8) return "-";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function openAllExternal(urls: string[]) {
  return () => {
    if (!confirm(`${urls.length}개 외부 사이트를 새 탭으로 모두 엽니다.`)) return;
    urls.forEach((u, i) => u && setTimeout(() => window.open(u, "_blank"), i * 100));
  };
}
