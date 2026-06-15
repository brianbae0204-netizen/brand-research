import type { NewsItem } from "./types";

/**
 * Google Gemini (AI Studio) 연동 — 무료 티어.
 *  키: https://aistudio.google.com/app/apikey → .env.local 의 GEMINI_API_KEY
 *
 * 용도
 *  1) 기업개요 작성 + 자체 검수
 *  2) 뉴스 연관성 검증(무관 기사 제거)
 *  3) 3개년 재무제표 분석
 *
 * ⚠️ 생성 결과는 제공된 컨텍스트(공개 뉴스) 기반이며 단정이 아니다. 검증 필요.
 *  키 미설정/오류 시 모든 함수는 null 을 반환하여 호출부가 폴백하도록 한다.
 */

const KEY = process.env.GEMINI_API_KEY?.trim() || "";
const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

export function isGeminiConfigured() {
  return Boolean(KEY);
}

async function callGemini(prompt: string, json = true): Promise<string | null> {
  if (!KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
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
  review: string; // 검수 코멘트 (검증 필요 사항)
}

/** 1) 기업개요 작성 + 자체 검수 */
export async function geminiOverview(
  companyName: string,
  brand: string | null,
  news: NewsItem[],
  blog: NewsItem[]
): Promise<GeminiOverview | null> {
  const ctx = snippets([...news, ...blog], 18);
  if (!ctx.trim()) return null;
  const prompt = `당신은 한국 기업 리서치 애널리스트입니다. 아래 뉴스/블로그 발췌만을 근거로 "${companyName}"${
    brand ? `(운영 브랜드: ${brand})` : ""
  }의 기업 개요를 작성하세요.

규칙:
- 반드시 제공된 발췌에 근거할 것. 발췌에 없는 사실을 지어내지 말 것.
- 발췌가 다른 회사 내용으로 보이면 무시할 것(동명이인/유사명 주의).
- intro: 4~6문장의 자연스러운 한국어 기업 소개(사업 본질, 대표 브랜드/제품, 시장 포지션, 성장/확장).
- businessArea: 한 줄 사업영역 요약.
- products: 주요 제품/서비스명 배열(최대 6, 발췌에 등장한 것만).
- review: 위 내용 중 근거가 약하거나 검증이 필요한 부분을 1~2문장으로 솔직히 지적.

JSON만 출력: {"intro": string, "businessArea": string, "products": string[], "review": string}

[발췌]
${ctx}`;
  return safeJson<GeminiOverview>(await callGemini(prompt, true));
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
  const out = safeJson<{ relevant: number[] }>(await callGemini(prompt, true));
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
  return safeJson<GeminiScreening>(await callGemini(prompt, true));
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
  return await callGemini(prompt, false);
}
