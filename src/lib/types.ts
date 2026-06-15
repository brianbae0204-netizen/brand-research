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
}

export interface FinancialSummaryRow {
  year: number;
  fs_div: string;
  values: Record<string, number | null>;
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
}
