"use client";

import {
  Sparkles, Calendar, Building2, Globe, MapPin, User, Hash as HashIcon,
  Users, DollarSign, BarChart3, Layers, Hash, ExternalLink, Info, Package, Briefcase,
} from "lucide-react";
import type { CompanyOverview, DataConfidence, MetricSource } from "@/lib/types";

function fmtWon(v: number | null | undefined) {
  if (v === null || v === undefined) return "-";
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(1)}조원`;
  if (a >= 1e8) return `${Math.round(v / 1e8).toLocaleString()}억원`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`;
  return `${v.toLocaleString()}원`;
}

function fmtDate(d?: string) {
  if (!d || d.length < 8) return "-";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

const CONF_STYLE: Record<DataConfidence, { label: string; cls: string }> = {
  confirmed: { label: "공식", cls: "bg-emerald-100 text-emerald-700" },
  estimated: { label: "추정·검증필요", cls: "bg-amber-100 text-amber-700" },
  unknown: { label: "정보없음", cls: "bg-slate-100 text-slate-500" },
};

function ConfidenceBadge({ source }: { source: MetricSource }) {
  const s = CONF_STYLE[source.confidence];
  return (
    <span
      className={`pill ${s.cls} text-[10px] inline-flex items-center gap-1 whitespace-nowrap`}
      title={`${source.source}${source.note ? " — " + source.note : ""}`}
    >
      {s.label}
    </span>
  );
}

/** lucide 아이콘을 항상 14px로 고정해 라벨과 겹치지 않게 */
function Ico({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center justify-center shrink-0 text-slate-400 [&>svg]:w-3.5 [&>svg]:h-3.5">{children}</span>;
}

function MetricCard({
  icon, label, value, sub, source, verifyLabel,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; source: MetricSource; verifyLabel?: string;
}) {
  return (
    <div className="card p-4 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-0">
          <Ico>{icon}</Ico>
          <span className="truncate">{label}</span>
        </div>
        <ConfidenceBadge source={source} />
      </div>
      <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 leading-snug">{sub}</div>}
      {source.verifyUrl && (
        <a href={source.verifyUrl} target="_blank" rel="noopener"
          className="text-[10px] text-brand-600 hover:underline inline-flex items-center gap-0.5 mt-auto pt-1">
          <ExternalLink className="w-2.5 h-2.5" /> {verifyLabel || "원본 확인"}
        </a>
      )}
    </div>
  );
}

function Attr({
  icon, label, value, link, className,
}: {
  icon: React.ReactNode; label: string; value?: string; link?: boolean; className?: string;
}) {
  const empty = !value || value === "-";
  return (
    <div className={`min-w-0 ${className || ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
        <Ico>{icon}</Ico>
        <span className="truncate">{label}</span>
      </div>
      {empty ? (
        <div className="text-slate-400 mt-0.5">-</div>
      ) : link ? (
        <a href={value!.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener"
          className="text-brand-600 hover:underline font-medium break-all mt-0.5 block">{value}</a>
      ) : (
        <div className="font-medium break-words text-slate-800 mt-0.5">{value}</div>
      )}
    </div>
  );
}

export function CompanyOverviewCard({ ov }: { ov: CompanyOverview }) {
  const inv = ov.investment;
  const estDt = fmtDate(ov.est_dt);
  const estLabel = ov.ageYears !== null ? `${estDt} (업력 ${ov.ageYears}년)` : estDt;

  return (
    <section className="space-y-4">
      {/* 헤더 카드 */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-center gap-1.5 mb-1">
          <Ico><Sparkles /></Ico>
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600">기본정보 및 요약</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{ov.corp_name}</h1>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {ov.corp_name_eng && <span className="text-sm text-slate-500">{ov.corp_name_eng}</span>}
          {ov.brand && (
            <span className="pill bg-pink-50 text-pink-600 text-[11px] font-semibold inline-flex items-center gap-1">
              <Ico><Package /></Ico>운영 브랜드 · {ov.brand}
            </span>
          )}
        </div>

        {/* 기업소개 */}
        <div className="mt-3">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-bold text-slate-700">기업소개</span>
            <ConfidenceBadge source={ov.introSource} />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{ov.intro}</p>
          {ov.introReview && (
            <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <Ico><Info /></Ico>
              <span><span className="font-semibold text-slate-600">AI 검수:</span> {ov.introReview}</span>
            </div>
          )}
        </div>

        {/* 사업영역 / 주요 제품 */}
        <div className="mt-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Ico><Briefcase /></Ico>
            <span className="text-xs font-bold text-slate-700">사업영역 · 주요 제품/서비스</span>
            <ConfidenceBadge source={ov.businessSource} />
          </div>
          <div className="text-sm text-slate-700">{ov.businessArea}</div>
          {ov.products.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ov.products.map((p, i) => (
                <span key={i} className="pill bg-slate-100 text-slate-600 text-[11px] inline-flex items-center gap-1">
                  <Ico><Package /></Ico>{p}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 키워드 */}
        {ov.keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ov.keywords.map((k) => (
              <span key={k} className="pill bg-brand-50 text-brand-700 text-[11px] font-semibold">#{k}</span>
            ))}
          </div>
        )}

        {/* 기본 식별 정보 (운영여부 제거) */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-xs sm:text-sm">
          <Attr icon={<Building2 />} label="기업명" value={ov.corp_name} />
          <Attr icon={<User />} label="대표자명" value={ov.ceo_nm} />
          <Attr icon={<HashIcon />} label="사업자번호" value={ov.bizr_no} />
          <Attr icon={<Calendar />} label="설립일 / 업력" value={estLabel} />
          <Attr icon={<Building2 />} label="상장여부" value={ov.is_listed ? `상장 (${ov.stock_code})` : "비상장"} />
          <Attr icon={<Globe />} label="홈페이지" value={ov.homepage.url || undefined} link />
          <Attr icon={<MapPin />} label="사업자 주소" value={ov.adres} className="col-span-2 sm:col-span-3" />
        </div>
      </div>

      {/* 핵심 지표 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard icon={<Users />} label="고용인원"
          value={ov.employment.headcount !== null ? `${ov.employment.headcount.toLocaleString()}명` : "-"}
          sub={ov.employment.source.source} source={ov.employment.source} verifyLabel="채용사이트" />
        <MetricCard icon={<DollarSign />} label="매출액"
          value={fmtWon(ov.latestRevenue.value)}
          sub={ov.latestRevenue.year ? `${ov.latestRevenue.year}년 (${ov.latestRevenue.source.source})` : "공시 없음"}
          source={ov.latestRevenue.source} verifyLabel="원본" />
        <MetricCard icon={<BarChart3 />} label="최종 투자단계"
          value={inv.stage ?? "-"} sub="뉴스 보도 기준" source={inv.source} verifyLabel="THE VC" />
        <MetricCard icon={<Layers />} label="누적 투자유치"
          value={fmtWon(inv.totalAmount)} sub="뉴스 언급 최대치" source={inv.source} verifyLabel="THE VC" />
        <MetricCard icon={<Hash />} label="투자유치 건수"
          value={inv.dealCount > 0 ? `${inv.dealCount}건` : "-"} sub="관련 보도 수" source={inv.source} verifyLabel="THE VC" />
      </div>

      {/* 투자 근거 기사 */}
      {inv.evidence.length > 0 && (
        <div className="card p-4 bg-amber-50/50 border-amber-200">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-2">
            <Ico><Info /></Ico> 투자 지표 근거 기사 (뉴스 추정 · 원문 검증 필요)
          </div>
          <ul className="space-y-1.5">
            {inv.evidence.map((e, i) => (
              <li key={i} className="text-xs">
                <a href={e.url} target="_blank" rel="noopener"
                  className="text-slate-700 hover:text-brand-700 hover:underline inline-flex items-start gap-1">
                  <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-600" />
                  <span className="line-clamp-1">{e.title}</span>
                  {e.amountText && <span className="ml-1 font-semibold text-amber-700 whitespace-nowrap">[{e.amountText}]</span>}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
