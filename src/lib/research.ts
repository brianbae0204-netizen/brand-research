import type { NewsItem, ShoppingItem, MetricSource } from "./types";

/**
 * 뉴스·블로그·쇼핑(네이버 검색 API, 무료)에서 기업 정보를 추출한다.
 *  - 기업소개(서술형 요약): 발췌 요약 (LLM 미사용)
 *  - 사업영역/주요 제품
 *  - 고용인원(임직원 N명) — 기사 추출
 *  - 매출(N억/조) — DART 미공시 시 폴백
 *
 * ⚠️ 모두 기사 기반 자동 추정이며 단정이 아니다. 원문 검증 필요.
 */

export interface ResearchResult {
  intro: string;
  introSource: MetricSource;
  businessArea: string;
  products: string[];
  businessSource: MetricSource;
  headcount: number | null;
  headcountSource: MetricSource;
  revenue: { value: number | null; year: number | null };
  revenueSource: MetricSource;
}

const norm = (s: string) => (s || "").replace(/\s+/g, "").toLowerCase();

const BRAND_STOP = /주식회사|법인|기업|대표|뉴스|기자|보도|코스닥|코스피|그룹|컴퍼니/;

/**
 * 뉴스·블로그에서 회사가 운영하는 브랜드명을 추정 (휴리스틱, Gemini 미사용 시 폴백).
 * "'OOO'라는 브랜드", "브랜드 'OOO'", "OOO라는 브랜드" 패턴.
 */
export function extractBrand(
  companyName: string,
  news: NewsItem[],
  blog: NewsItem[]
): string | null {
  const cn = norm(companyName);
  const text = [...news, ...blog].map((n) => `${n.title} ${n.desc}`).join(" ");
  const cand = new Map<string, number>();
  const add = (raw?: string) => {
    if (!raw) return;
    let b = raw
      .replace(/['"‘’“”`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    // 끝에 붙은 한국어 조사 제거 (온그리디언츠 를 → 온그리디언츠)
    b = b.replace(/\s*(을|를|이|가|은|는|의|에|로|와|과|도|만|라는|이라는)$/, "").trim();
    if (b.length < 2 || b.length > 20) return;
    if (norm(b) === cn) return;
    if (BRAND_STOP.test(b)) return;
    cand.set(b, (cand.get(b) || 0) + 1);
  };
  // 따옴표 종류 (일반/스마트)
  const Q = "['\"‘’“”`]";
  const patterns: RegExp[] = [
    // 'X'라는/이라는 브랜드  ·  'X' 브랜드
    new RegExp(`${Q}([^'\"‘’“”\`]{2,20})${Q}\\s*(?:라는|이라는)?\\s*브랜드`, "g"),
    // 브랜드 'X'  ·  브랜드명 'X'
    new RegExp(`브랜드(?:명)?\\s*${Q}([^'\"‘’“”\`]{2,20})${Q}`, "g"),
    // X라는/이라는 브랜드
    /([가-힣A-Za-z0-9]{2,18})\s*(?:라는|이라는)\s*브랜드/g,
    // (클린뷰티) 브랜드인 X를/을/이/가  · 브랜드 X 운영/런칭
    /브랜드(?:인|는|의|\s)?\s*([가-힣A-Za-z][가-힣A-Za-z0-9]{1,17})\s*(?:를|을|이|가|는|로|에서|\(|,|\.|\s*(?:운영|런칭|전개|출시))/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) add(m[1]);
  }
  if (cand.size === 0) return null;
  return [...cand.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** 키워드 기반 뉴스 연관성 필터 (Gemini 미설정 시 폴백) */
export function keywordRelevantNews(
  companyName: string,
  brand: string | null,
  news: NewsItem[]
): NewsItem[] {
  const tokens = [norm(companyName), brand ? norm(brand) : ""].filter(Boolean);
  return news.filter((n) => {
    const blob = norm(`${n.title} ${n.desc}`);
    return tokens.some((t) => t && blob.includes(t));
  });
}

// 소개 문장에서 배제할 잡음 (URL·양식·기자·특수문자 덩어리 등)
const JUNK = /https?:\/\/|www\.|\.com|\.kr\/|\.co\b|@|pdf|기자|무단전재|재배포|저작권|구독|클릭|바로가기|\[.*\]|▶|◇|■|●|☞|-\s*기업명|-\s*주소|idxno/i;

function isCleanSentence(s: string): boolean {
  if (JUNK.test(s)) return false;
  const korean = (s.match(/[가-힣]/g) || []).length;
  if (korean < 8) return false; // 한글 비중이 너무 낮으면 제외
  const special = (s.match(/[^가-힣A-Za-z0-9 .,·!?%()'"~\-]/g) || []).length;
  if (special > 4) return false;
  return true;
}

function splitSentences(text: string): string[] {
  return (text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=다\.)\s|(?<=[.!?])\s|(?<=다)\s(?=[A-Z가-힣])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15 && s.length <= 160)
    .filter(isCleanSentence);
}

// 기업 설명에 어울리는 키워드 (요약 문장 가중치)
const DESC_KW = [
  "브랜드", "운영", "출시", "제품", "판매", "서비스", "기업", "설립", "대표",
  "스타트업", "플랫폼", "진출", "성장", "유통", "제조", "런칭", "선보", "전개",
  "라인", "컨셉", "슬로건", "고객", "시장", "수출", "글로벌",
];

// 사업영역 추출용 키워드
const BIZ_KW = [
  "화장품", "뷰티", "스킨케어", "코스메틱", "패션", "의류", "식품", "음료",
  "헬스", "건강기능식품", "이커머스", "커머스", "플랫폼", "콘텐츠", "게임",
  "교육", "핀테크", "금융", "모빌리티", "물류", "제조", "유통", "디바이스",
  "반려동물", "가전", "리빙", "주류", "디저트",
];

function cleanProductTitle(t: string): string {
  return (t || "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 기업소개 발췌 요약 */
function buildIntro(companyName: string, news: NewsItem[], blog: NewsItem[]) {
  const cn = norm(companyName);
  const pool: string[] = [];
  for (const n of [...news, ...blog]) {
    for (const s of splitSentences(`${n.title}. ${n.desc}`)) pool.push(s);
  }
  // 점수화
  const scored = pool
    .map((s) => {
      let score = 0;
      if (norm(s).includes(cn)) score += 3;
      for (const k of DESC_KW) if (s.includes(k)) score += 1;
      if (/(투자유치|투자 유치|기자|보도자료|밝혔다)/.test(s)) score -= 1;
      if (s.length >= 30 && s.length <= 110) score += 1;
      return { s, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);

  // 중복 제거하며 상위 3문장
  const picked: string[] = [];
  for (const { s } of scored) {
    if (picked.length >= 3) break;
    if (picked.some((p) => norm(p).includes(norm(s).slice(0, 20)))) continue;
    picked.push(s);
  }

  if (picked.length === 0) {
    return {
      intro: `${companyName}에 대한 뉴스·블로그에서 충분한 소개 문장을 찾지 못했습니다. 외부 출처에서 직접 확인이 필요합니다.`,
      confidence: "unknown" as const,
    };
  }
  let intro = picked.join(" ");
  if (intro.length > 300) intro = intro.slice(0, 297) + "...";
  return { intro, confidence: "estimated" as const };
}

/** 사업영역 + 주요 제품 */
function buildBusiness(news: NewsItem[], blog: NewsItem[], shopping: ShoppingItem[]) {
  const blob = [...news, ...blog].map((n) => `${n.title} ${n.desc}`).join(" ");

  // 사업영역 키워드 빈도
  const freq = new Map<string, number>();
  for (const k of BIZ_KW) {
    const c = (blob.match(new RegExp(k, "g")) || []).length;
    if (c > 0) freq.set(k, c);
  }
  // 쇼핑 카테고리도 반영
  for (const s of shopping) {
    if (s.category) freq.set(s.category, (freq.get(s.category) || 0) + 1);
  }
  const areas = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]);

  // 주요 제품 — 쇼핑 상품명 상위(중복 토큰 제거)
  const products: string[] = [];
  for (const s of shopping) {
    const t = cleanProductTitle(s.title);
    if (t.length < 4 || t.length > 40) continue;
    if (products.some((p) => norm(p) === norm(t))) continue;
    products.push(t);
    if (products.length >= 6) break;
  }

  const businessArea =
    areas.length > 0
      ? areas.join(" · ")
      : "수집된 기사에서 사업영역을 특정하지 못했습니다.";

  return {
    businessArea,
    products,
    confidence: (areas.length > 0 || products.length > 0 ? "estimated" : "unknown") as
      | "estimated"
      | "unknown",
  };
}

/** 고용인원 — "임직원/직원 N명" 추출 */
function extractHeadcount(companyName: string, news: NewsItem[], blog: NewsItem[]) {
  const cn = norm(companyName);
  const re = /(?:임직원|직원|종업원|구성원|고용인원|사원)\s*(?:수)?\s*(?:약|총)?\s*([0-9][0-9,]{0,6})\s*명/g;
  const counts: number[] = [];
  for (const n of [...news, ...blog]) {
    const blob = `${n.title} ${n.desc}`;
    if (!norm(blob).includes(cn)) continue;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(blob)) !== null) {
      const v = Number(m[1].replace(/,/g, ""));
      if (v > 0 && v < 1_000_000) counts.push(v);
    }
  }
  if (counts.length === 0) return { headcount: null, confidence: "unknown" as const };
  // 최빈값 우선, 없으면 최대값
  const tally = new Map<number, number>();
  counts.forEach((c) => tally.set(c, (tally.get(c) || 0) + 1));
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  return { headcount: sorted[0][0], confidence: "estimated" as const };
}

/** 매출 폴백 — "매출 N억/조" 추출 */
function extractRevenue(companyName: string, news: NewsItem[], blog: NewsItem[]) {
  const cn = norm(companyName);
  const re = /매출(?:액)?\s*(?:약)?\s*([0-9][0-9,\.]*)\s*(조|억)\s*(?:([0-9][0-9,\.]*)\s*억)?/g;
  const yearRe = /(20[0-2][0-9])\s*년/;
  let best: { value: number; year: number | null } | null = null;
  for (const n of [...news, ...blog]) {
    const blob = `${n.title} ${n.desc}`;
    if (!norm(blob).includes(cn)) continue;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(blob)) !== null) {
      let value = 0;
      const a = Number(m[1].replace(/,/g, ""));
      if (m[2] === "조") value = a * 1e12 + (m[3] ? Number(m[3].replace(/,/g, "")) * 1e8 : 0);
      else value = a * 1e8;
      if (value <= 0 || value > 1e14) continue;
      const ym = blob.slice(Math.max(0, m.index - 30), m.index).match(yearRe);
      const year = ym ? Number(ym[1]) : null;
      if (!best || value > best.value) best = { value, year };
    }
  }
  if (!best) return { value: null, year: null, confidence: "unknown" as const };
  return { ...best, confidence: "estimated" as const };
}

export function research(
  companyName: string,
  news: NewsItem[],
  blog: NewsItem[],
  shopping: ShoppingItem[]
): ResearchResult {
  const introR = buildIntro(companyName, news, blog);
  const bizR = buildBusiness(news, blog, shopping);
  const headR = extractHeadcount(companyName, news, blog);
  const revR = extractRevenue(companyName, news, blog);

  const newsVerify = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(companyName)}`;

  return {
    intro: introR.intro,
    introSource: {
      source: "뉴스·블로그 자동요약",
      confidence: introR.confidence,
      verifyUrl: newsVerify,
      note: "기사 발췌 기반 자동 요약 — 사실관계는 원문 확인 필요.",
    },
    businessArea: bizR.businessArea,
    products: bizR.products,
    businessSource: {
      source: "기사·쇼핑 추출",
      confidence: bizR.confidence,
      verifyUrl: newsVerify,
    },
    headcount: headR.headcount,
    headcountSource: {
      source: "기사 추출(임직원수)",
      confidence: headR.confidence,
      verifyUrl: `https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(companyName)}`,
      note: "기사에 언급된 임직원 수 — 채용사이트(잡코리아/사람인/캐치/원티드)에서 검증 권장.",
    },
    revenue: { value: revR.value, year: revR.year },
    revenueSource: {
      source: "기사 추출(매출)",
      confidence: revR.confidence,
      verifyUrl: newsVerify,
      note: "기사 언급 매출 — DART 미공시 시 폴백, 검증 필요.",
    },
  };
}
