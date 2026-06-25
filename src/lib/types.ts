export type ResearchPurpose =
  | "investment"
  | "jbp"
  | "ma"
  | "sourcing";

export const PURPOSE_LABELS: Record<ResearchPurpose, { label: string; desc: string; emoji: string }> = {
  investment: { label: "투자 검토", desc: "재무 · 투자유치 · 밸류에이션 중심", emoji: "💰" },
  jbp:        { label: "JBP / 전략적 제휴", desc: "채널 · 브랜드 · 유통 시너지 중심", emoji: "🤝" },
  ma:         { label: "M&A 후보 검토", desc: "재무 심층 · 지분 · 핵심자산 중심", emoji: "🎯" },
  sourcing:   { label: "입점 / 소싱 검토", desc: "사업자 · 통신판매업 · 평판 중심", emoji: "🛒" },
};

export interface DartCorp {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  is_listed: boolean;
}

export interface DartCompanyInfo {
  corp_name: string;
  corp_name_eng?: string;
  stock_code?: string;
  ceo_nm?: string;
  est_dt?: string;
  acc_mt?: string;
  adres?: string;
  hm_url?: string;
  phn_no?: string;
  induty_code?: string;
  bizr_no?: string; // 사업자등록번호
  jurir_no?: string; // 법인등록번호
}

export interface FinancialSummaryRow {
  year: number;
  fs_div: string;
  values: Record<string, number | null>;
}

/** 출처/신뢰도 라벨 — 단정하지 않고 검증 필요성을 명시하기 위한 메타 */
export type DataConfidence = "confirmed" | "estimated" | "unknown";

export interface MetricSource {
  /** 데이터 출처 (예: "DART", "국민연금공단", "네이버 뉴스 추정") */
  source: string;
  confidence: DataConfidence;
  /** 검증/확인용 외부 링크 (선택) */
  verifyUrl?: string;
  note?: string;
}

/** 고용 정보 — 국민연금 가입자수 또는 기사 추출 */
export interface EmploymentInfo {
  /** 고용인원 (국민연금 가입자수 또는 기사 언급) */
  headcount: number | null;
  /** 매칭된 사업장명 (국민연금) */
  matchedName?: string;
  source: MetricSource;
}

/** 뉴스 기반 투자 지표 (추정) */
export interface InvestmentInfo {
  /** 최종 투자단계 (예: 시드, 시리즈 A) — 미확인 시 null */
  stage: string | null;
  /** 누적 투자유치금액 (원) — 뉴스 언급 최대치 기준 추정 */
  totalAmount: number | null;
  /** 투자유치 보도 건수 */
  dealCount: number;
  /** 근거 기사 */
  evidence: { title: string; url: string; date?: string; amountText?: string }[];
  source: MetricSource;
}

/** 홈페이지 (검색 추정) */
export interface HomepageInfo {
  url: string | null;
  source: MetricSource;
}

/** 재무 분석 (Gemini) */
export interface FinancialAnalysis {
  text: string;
  source: MetricSource;
}

/** 투자 스크리닝 — 6개 카테고리 */
export interface ScreeningField {
  label: string;
  value: string; // "정보 없음 / 실사 필요" 포함
  source: MetricSource;
}
export interface ScreeningCategory {
  id: string;
  title: string;
  emoji: string;
  fields: ScreeningField[];
}
export interface ScreeningResult {
  corp_name: string;
  brand?: string | null;
  aiEnabled: boolean;
  categories: ScreeningCategory[];
}

/** 검색 화면 상단 기업 개요 */
export interface CompanyOverview {
  corp_name: string;
  corp_name_eng?: string;
  /** 자동 생성 기업 소개 (뉴스·블로그 발췌 요약) */
  intro: string;
  introSource: MetricSource;
  /** 사업영역 및 주요 제품/서비스 (기사 리서치) */
  businessArea: string;
  products: string[];
  businessSource: MetricSource;
  keywords: string[];
  /** 운영 브랜드 (검색 기준) */
  brand?: string | null;
  /** AI 검수 코멘트 (Gemini) — 검증 필요 사항 */
  introReview?: string | null;
  // 기본 식별 정보
  ceo_nm?: string;
  bizr_no?: string; // 사업자등록번호 (DART)
  adres?: string;
  est_dt?: string;
  /** 업력(년) — 설립일 기준 */
  ageYears: number | null;
  is_listed: boolean;
  stock_code?: string;
  induty_code?: string;
  homepage: HomepageInfo;
  employment: EmploymentInfo;
  investment: InvestmentInfo;
  /** 최신 매출액 (DART 우선, 없으면 기사 추정) */
  latestRevenue: { value: number | null; year: number | null; source: MetricSource };
}

export interface NewsItem {
  title: string;
  desc: string;
  url: string;
  date?: string;
  blogger?: string;
}

export interface ShoppingItem {
  title: string;
  price: number;
  mall: string;
  url: string;
  image?: string;
  category?: string;
}

export interface ExternalLink {
  name: string;
  url: string;
  desc?: string;
}

export interface DataSource {
  id: string;
  title: string;
  emoji: string;
  category: "auto" | "external";
  description: string;
  checklist: string[];
  url?: string;
  priority?: number;
}

/** 브랜드 → 운영 법인 자동 매핑 (AI 사전지식) */
export interface BrandCorpMapping {
  input: string;     // 사용자 입력 원본 (브랜드명, 예: "온그리디언츠")
  mappedTo: string;  // AI 매핑 결과 법인명 (예: "파워플레이어")
  confidence: "high" | "medium" | "low";
  reason: string;    // 매핑 근거 (사용자 표시용)
}

export interface SearchResult {
  query: string;
  purpose: ResearchPurpose;
  timestamp: string;
  dart_candidates: DartCorp[];
  naver_news: NewsItem[];
  naver_blog: NewsItem[];
  naver_shopping: ShoppingItem[];
  data_sources: Record<string, DataSource[]>;
  warnings: string[];
  /** DART 검색 0건일 때 AI가 브랜드→법인 매핑 후 재검색한 경우 표시 */
  mappedFrom?: BrandCorpMapping;
}
