import type { EmploymentInfo } from "./types";

/**
 * 공공데이터포털 무료 API 연동.
 *
 * 국민연금공단_국민연금 가입 사업장 내역
 *   https://www.data.go.kr/data/15083277/openapi.do
 *   → 사업장명으로 검색하여 "가입자 수(jnngpCnt)"를 고용인원의 무료 대용 지표로 사용.
 *
 * 주의:
 *  - 가입자 수는 국민연금 가입 기준이므로 실제 고용인원과 다를 수 있습니다(추정치).
 *  - serviceKey(무료)는 data.go.kr 에서 발급받아 .env.local 의 DATA_GO_KR_KEY 에 넣어야 합니다.
 */

const DATA_KEY = process.env.DATA_GO_KR_KEY?.trim() || "";

const NPS_BASE =
  "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2/getBassInfoSearchV2";

export function isPublicDataConfigured() {
  return Boolean(DATA_KEY);
}

/** 검색어 정규화 — "주식회사"/"(주)" 등 법인 접두/접미어 제거 후 비교 */
function normalize(s: string): string {
  return (s || "")
    .replace(/주식회사|\(주\)|㈜|유한회사|\(유\)|<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

interface NpsRow {
  wkplNm?: string; // 사업장명
  jnngpCnt?: string | number; // 가입자 수
  wkplJnngStcd?: string | number; // 사업장 가입상태코드 (1: 등록, 2: 탈퇴)
  wkplRoadNmDtlAddr?: string; // 도로명 상세주소
  adptDt?: string; // 적용일자
}

/**
 * 국민연금 가입사업장에서 회사명으로 고용/운영 정보를 조회.
 * 키 미설정·오류·미발견 시에도 throw 하지 않고 안전한 기본값을 반환.
 */
export async function getEmploymentInfo(
  companyName: string
): Promise<EmploymentInfo> {
  const verifyUrl = `https://www.nps.or.kr/`;
  const fallback = (
    confidence: EmploymentInfo["source"]["confidence"],
    note: string
  ): EmploymentInfo => ({
    headcount: null,
    source: { source: "국민연금공단", confidence, verifyUrl, note },
  });

  if (!DATA_KEY) {
    return fallback(
      "unknown",
      "DATA_GO_KR_KEY 미설정 — 공공데이터포털에서 무료 발급 후 .env.local에 추가하세요."
    );
  }

  // 검색명 정리: "(주)/주식회사/㈜" 접두·접미 제거 (NPS 사업장명은 보통 접두어 없이 등록됨)
  // 예: "(주)파워플레이어" → "파워플레이어"
  const queryName = companyName
    .replace(/^\((주|유)\)/, "")
    .replace(/^(주식회사|유한회사)\s*/, "")
    .replace(/㈜/g, "")
    .trim();

  /** 국민연금 API 호출 — serviceKey는 직접 URL 문자열로 (이중 인코딩 방지)
   *  data.go.kr 디코딩 키는 64자 hex라 인코딩 불필요, but URLSearchParams는 항상 인코딩 시도 → 일부 게이트웨이에서 401 유발.
   */
  const buildUrl = (name: string) => {
    const qs = [
      `serviceKey=${DATA_KEY}`,
      `wkpl_nm=${encodeURIComponent(name)}`,
      `pageNo=1`,
      `numOfRows=30`,
      `resultType=json`,
    ].join("&");
    return `${NPS_BASE}?${qs}`;
  };

  /** 1차: 정리된 이름으로, 실패 시 원본 이름으로 재시도 */
  const tryFetch = async (name: string): Promise<{ rows: NpsRow[]; status: number; raw: string } | null> => {
    try {
      const res = await fetch(buildUrl(name), { cache: "no-store" });
      const raw = await res.text();
      if (!res.ok) return { rows: [], status: res.status, raw };
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        return { rows: [], status: res.status, raw };
      }
      const body = data?.response?.body ?? data?.body;
      const items = body?.items?.item ?? body?.items ?? [];
      const rows = Array.isArray(items) ? items : items ? [items] : [];
      return { rows, status: res.status, raw };
    } catch {
      return null;
    }
  };

  let attempt = await tryFetch(queryName);
  // 401/403 + 정리된 이름과 원본이 다르면 원본으로 재시도
  if (attempt && attempt.status >= 400 && queryName !== companyName) {
    const alt = await tryFetch(companyName);
    if (alt && alt.status < 400) attempt = alt;
  }

  if (!attempt) {
    return fallback("unknown", "국민연금 API 네트워크 호출 실패");
  }
  if (attempt.status === 401 || attempt.status === 403) {
    return fallback(
      "unknown",
      `국민연금 API 인증 실패(${attempt.status}) — data.go.kr에서 "국민연금공단_국민연금 가입 사업장 내역" API 신청·승인 확인 필요. 키가 다른 API용일 수 있습니다.`
    );
  }
  if (attempt.status >= 400) {
    return fallback("unknown", `국민연금 API 응답 오류: ${attempt.status}`);
  }
  const rows: NpsRow[] = attempt.rows;

  if (rows.length === 0) {
    return fallback(
      "unknown",
      "국민연금 가입사업장에서 일치 항목을 찾지 못했습니다(미가입·명칭 불일치 가능)."
    );
  }

  // 회사명 정규화 일치 우선, 없으면 가입자수 최다 사업장 선택
  const target = normalize(companyName);
  const exact = rows.filter((r) => normalize(String(r.wkplNm)) === target);
  const candidates = exact.length > 0 ? exact : rows;
  const best = candidates
    .map((r) => ({
      name: String(r.wkplNm ?? ""),
      count: Number(String(r.jnngpCnt ?? "").replace(/,/g, "")) || 0,
    }))
    .sort((a, b) => b.count - a.count)[0];

  if (!best) {
    return fallback("unknown", "유효한 사업장 데이터가 없습니다.");
  }

  return {
    headcount: best.count > 0 ? best.count : null,
    matchedName: best.name,
    source: {
      source: "국민연금공단 가입자수",
      confidence: "estimated",
      verifyUrl,
      note: "국민연금 가입자 수 기준 추정 — 실제 고용인원과 차이가 있을 수 있습니다.",
    },
  };
}
