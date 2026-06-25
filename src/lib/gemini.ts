import type { NewsItem } from "./types";

/**
 * AI 연동 — Groq(Llama 3.3 70B) 우선 + Gemini 폴백.
 *
 * 키 설정 (.env.local)
 *  - GROQ_API_KEY    : https://console.groq.com  (1순위, 무료 한도 큼)
 *  - GEMINI_API_KEY  : https://aistudio.google.com/app/apikey  (폴백, 한국어 품질)
 *
 * 라우팅
 *  1) Groq가 설정되어 있으면 먼저 시도 (빠르고 한도 큼)
 *  2) Groq 실패 또는 미설정 시 Gemini로 자동 폴백
 *  3) 둘 다 실패하면 null 반환 (호출부가 휴리스틱 폴백)
 *
 * 용도: 기업개요·운영 브랜드 추출, 뉴스 연관성 검증, 3개년 재무 분석.
 *
 * ⚠️ 생성 결과는 제공된 컨텍스트 기반이며 단정이 아니다. 검증 필요.
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY?.trim() || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GROQ_KEY = process.env.GROQ_API_KEY?.trim() || "";
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";

export function isGeminiConfigured() {
  // 호출부 호환을 위해 이름 유지 — Groq 또는 Gemini 중 하나라도 설정되면 true
  return Boolean(GROQ_KEY || GEMINI_KEY);
}

/** Groq (OpenAI 호환 API) — Llama 3.3 70B */
async function callGroq(prompt: string, json = true): Promise<string | null> {
  if (!GROQ_KEY) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      cache: "no-store",
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 2048,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}

/** Gemini (Google AI Studio) — 폴백 */
async function callGemini(prompt: string, json = true): Promise<string | null> {
  if (!GEMINI_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          // Gemini 2.5는 기본 thinking 토큰이 출력 한도를 소비 → JSON 잘림 방지 위해 비활성
          thinkingConfig: { thinkingBudget: 0 },
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}

/** AI 라우터 — Groq 우선, 실패 시 Gemini 폴백
 *  @param preferGemini  true면 Gemini 먼저 시도 (한국 니치 도메인 지식이 필요한 경우)
 */
async function callAI(prompt: string, json = true, preferGemini = false): Promise<string | null> {
  if (preferGemini) {
    // Gemini 우선 (한국어 니치 지식, 예: 브랜드↔법인 매핑)
    if (GEMINI_KEY) {
      const r = await callGemini(prompt, json);
      if (r && r.trim()) return r;
    }
    return await callGroq(prompt, json);
  }
  // 기본: Groq 우선 (속도/한도)
  if (GROQ_KEY) {
    const r = await callGroq(prompt, json);
    if (r && r.trim()) return r;
  }
  return await callGemini(prompt, json);
}

function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // 코드펜스 등 제거 후 재시도
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** 뉴스/블로그 스니펫을 프롬프트용으로 직렬화 */
function snippets(items: NewsItem[], n = 16): string {
  return items
    .slice(0, n)
    .map((it, i) => `[${i}] ${it.title} :: ${it.desc}`)
    .join("\n");
}

export interface GeminiOverview {
  intro: string;
  businessArea: string;
  products: string[];
  brands: string[];   // 법인이 운영하는 자체 브랜드 (검색 키워드로도 사용)
  review: string;     // 검수 코멘트 (검증 필요 사항)
}

/** 1) 기업개요 + 운영 브랜드 통합 추출 (1회 호출로 4개 분야 동시 처리 — quota 절약)
 *
 * @param companyName  법인명 (DART 정식 표기, 예: "(주)에이피알")
 * @param identifier   회사 식별 정보 (DART 종목코드·업종·홈페이지 등 — 동명이인 방지)
 * @param brand        휴리스틱으로 추정된 운영 브랜드 (있을 시 힌트로 활용)
 * @param news         네이버 뉴스 발췌
 * @param blog         네이버 블로그 발췌
 */
export async function geminiOverview(
  companyName: string,
  identifier: { stock_code?: string; induty_code?: string; homepage?: string; ceo?: string; est_dt?: string },
  brand: string | null,
  news: NewsItem[],
  blog: NewsItem[],
  homepageText?: string | null
): Promise<GeminiOverview | null> {
  const ctx = snippets([...news, ...blog], 22);
  const idLines = [
    identifier.stock_code ? `- 종목코드: ${identifier.stock_code}` : "",
    identifier.induty_code ? `- 업종코드: ${identifier.induty_code}` : "",
    identifier.ceo ? `- 대표이사: ${identifier.ceo}` : "",
    identifier.est_dt ? `- 설립일: ${identifier.est_dt}` : "",
    identifier.homepage ? `- 홈페이지: ${identifier.homepage}` : "",
  ].filter(Boolean).join("\n");

  const homepageSection = homepageText
    ? `[공식 홈페이지 텍스트 — 가장 신뢰도 높음, 우선 참고]\n${homepageText.slice(0, 1800)}\n\n`
    : "";

  const prompt = `당신은 한국 기업 리서치 애널리스트입니다. 아래 회사 식별 정보와 발췌를 종합해 "${companyName}"의 기업 개요와 자체 브랜드 라인업을 추출하세요.

[회사 식별 정보 — DART 공시 기준]
- 법인명: ${companyName}
${idLines}
${brand ? `- 추정 대표 브랜드: ${brand}` : ""}

규칙:
- **공식 홈페이지 텍스트가 있으면 그것을 1순위 근거로 삼아 intro를 작성할 것**. 홈페이지 소개 문구를 자연스러운 한국어로 재구성.
- **회사 식별 정보로 정확히 어떤 회사인지 판단할 것** (동명이인·유사명 회사와 혼동 금지).
- 발췌에 등장한 정보 우선, 발췌가 무관해 보이면 회사 식별 정보와 당신의 사전 지식을 활용해 정확한 사실만 기술.
- intro: 4~6문장의 자연스러운 한국어 기업 소개(사업 본질, 대표 브랜드/제품, 시장 포지션, 성장/확장).
- businessArea: 한 줄 사업영역 요약.
- products: 주요 제품/서비스명 배열 (최대 6).
- brands: **법인이 실제 소유·운영하는 자체 브랜드** 또는 주력 제품 라인업 이름 (최대 6, **반드시 1개 이상**).
  · 회사명 자체가 곧 브랜드명이면 그대로 포함.
  · 한국 소비자에게 가장 친숙한 표기(한글/영문) 1가지.
  · 예: "(주)에이피알" → ["메디큐브","에이지알","에이프릴스킨","포맨트"], "비나우" → ["넘버즈인","Fwee","Knock"], "파워플레이어" → ["온그리디언츠"].
- review: 근거의 강·약(홈페이지/발췌/사전 지식)을 1~2문장으로 솔직히 명시.

JSON만 출력: {"intro": string, "businessArea": string, "products": string[], "brands": string[], "review": string}

${homepageSection}[뉴스·블로그 발췌 — 노이즈 있을 수 있음, 회사 관련된 것만 골라 사용]
${ctx || "(발췌 없음 — 홈페이지 텍스트 및 사전 지식 활용)"}`;
  return safeJson<GeminiOverview>(await callAI(prompt, true));
}

/** 2) 뉴스 연관성 검증 — 회사/브랜드와 무관한 기사 인덱스를 제거 */
export async function geminiRelevantNews(
  companyName: string,
  brand: string | null,
  news: NewsItem[]
): Promise<number[] | null> {
  if (news.length === 0) return [];
  const list = news.map((n, i) => `[${i}] ${n.title} :: ${n.desc}`).join("\n");
  const prompt = `다음 기사들 중 "${companyName}"${
    brand ? ` 또는 그 운영 브랜드 "${brand}"` : ""
  }에 **직접 관련된** 기사의 인덱스만 고르세요. 동명이인·유사명·무관 광고/기사(예: 스포츠, 게임 용어, 다른 회사)는 제외하세요.

JSON만 출력: {"relevant": number[]}

[기사]
${list}`;
  const out = safeJson<{ relevant: number[] }>(await callAI(prompt, true));
  if (!out || !Array.isArray(out.relevant)) return null;
  return out.relevant.filter((i) => Number.isInteger(i) && i >= 0 && i < news.length);
}

/** 4) 투자 스크리닝 — 자료가 부족한 'soft' 필드를 컨텍스트 기반으로 채움 (1회 호출) */
export interface GeminiScreening {
  c1: Record<string, string>;
  c2: Record<string, string>;
  c3: Record<string, string>;
  c4: Record<string, string>;
  c5: Record<string, string>;
  c6: Record<string, string>;
}

export async function geminiScreening(
  companyName: string,
  brand: string | null,
  context: string
): Promise<GeminiScreening | null> {
  if (!context.trim()) return null;
  const prompt = `당신은 뷰티 브랜드 투자 심사역입니다. "${companyName}"${
    brand ? `(브랜드: ${brand})` : ""
  }에 대해 아래 컨텍스트(DART 공시 사실 + 뉴스/제품 발췌)만을 근거로 투자 스크리닝 항목을 채우세요.

엄격 규칙:
- 컨텍스트에 근거가 있으면 간결한 값(한 줄)으로, 근거가 없으면 정확히 "정보 없음 / 실사 필요"로 적을 것.
- 절대 임의의 숫자/사실을 지어내지 말 것. 추정이면 "(추정)"을 덧붙일 것.
- 모든 필드는 한국어, 한 줄.

아래 JSON 스키마로만 출력:
{
 "c1": {"등기임원":"", "대표이력":"", "자본금":"", "주주구성_지분율":"", "관계사_모자회사":"", "화장품책임판매업등록":""},
 "c2": {"재고자산회전율":"", "매출채권_미수금":"", "차입금_부채":""},
 "c3": {"매출집중도_히어로SKU":"", "재구매율_정기배송비중":"", "제조구조_자체_ODM_OEM":""},
 "c4": {"온오프라인_비중":"", "자사몰_vs_외부플랫폼":"", "주요채널_의존도":"", "국내_해외비중_진출방식":""},
 "c5": {"SNS팔로워_추세":"", "리뷰수_평점_검색량":"", "광고_인플루언서_CAC":""},
 "c6": {"상표권_등록현황":"", "특허_디자인권":"", "행정처분_리콜_표시광고위반":"", "소송_채무보증_가압류":""}
}

[컨텍스트]
${context}`;
  return safeJson<GeminiScreening>(await callAI(prompt, true));
}

/** 3) 3개년 재무제표 분석 */
export async function geminiFinancialAnalysis(
  companyName: string,
  rowsText: string
): Promise<string | null> {
  if (!rowsText.trim()) return null;
  const prompt = `아래는 "${companyName}"의 최근 3개년 재무 요약(DART 기준, 단위 원)입니다. 한국어로 3~5문장의 핵심 분석을 작성하세요.
- 매출/영업이익/당기순이익 추이와 수익성(영업이익률) 변화
- 재무안정성(부채비율 등) 한 줄
- 단정적 투자판단/추천은 하지 말고, 객관적 해석과 유의점 위주로.

순수 텍스트만 출력(JSON 아님).

[재무 요약]
${rowsText}`;
  return await callAI(prompt, false);
}

/** 5) 브랜드명 → 운영 법인 매핑 (AI 사전지식 기반)
 *  예: "온그리디언츠" → "파워플레이어", "메디큐브" → "에이피알"
 *  DART 등록명 기준으로 한국 법인의 정식 명칭을 찾는다.
 */
export interface CorpResolution {
  corpName: string | null;    // DART 등록명 (예: "파워플레이어", "에이피알") — 확실하지 않으면 null
  confidence: "high" | "medium" | "low";
  reason: string;             // 매핑 근거 (예: "온그리디언츠는 (주)파워플레이어가 운영하는 클린뷰티 D2C 브랜드")
}

export async function aiResolveCorp(brand: string): Promise<CorpResolution | null> {
  if (!brand.trim()) return null;
  const prompt = `당신은 한국 기업 데이터 전문가입니다. 아래 브랜드명을 운영하는 한국 법인의 정식 명칭을 찾으세요.

[브랜드명] ${brand}

규칙:
- 한국 DART(전자공시) 등록명 기준 법인 정식 명칭만 출력 ("(주)" 접두어는 생략).
- 본인의 사전 지식 기반. 확실하지 않으면 corpName: null, confidence: "low".
- 가장 확실한 1개 법인만 반환.
- 같은 브랜드를 여러 회사가 사용하는 경우, **K-뷰티·소비재·커머스** 분야 한국 법인을 우선.

예시:
- "온그리디언츠" → {"corpName": "파워플레이어", "confidence": "high", "reason": "온그리디언츠는 (주)파워플레이어가 운영하는 클린뷰티 D2C 브랜드"}
- "메디큐브" → {"corpName": "에이피알", "confidence": "high", "reason": "메디큐브는 (주)에이피알의 뷰티 디바이스/스킨케어 브랜드"}
- "넘버즈인" → {"corpName": "비나우", "confidence": "high", "reason": "비나우가 운영하는 색조 멀티브랜드"}
- "글램팜" → {"corpName": "언일전자", "confidence": "high", "reason": "언일전자의 헤어스타일러 브랜드"}

JSON만 출력: {"corpName": string | null, "confidence": "high"|"medium"|"low", "reason": string}`;

  // 1차: Gemini 우선 (한국 니치 브랜드 지식이 우세)
  const first = safeJson<CorpResolution>(await callAI(prompt, true, /* preferGemini */ true));
  if (first?.corpName && first.confidence !== "low") return first;

  // 2차: 첫 시도가 null·low 면 Groq로 재시도 (두 모델 의견 다를 수 있음)
  if (GROQ_KEY && GEMINI_KEY) {
    const second = safeJson<CorpResolution>(await callGroq(prompt, true));
    if (second?.corpName && second.confidence !== "low") return second;
  }

  // 둘 다 자신 없으면 첫 응답(또는 null) 그대로
  return first;
}
