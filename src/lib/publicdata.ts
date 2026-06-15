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

  const params = new URLSearchParams({
    serviceKey: DATA_KEY,
    wkpl_nm: companyName,
    pageNo: "1",
    numOfRows: "30",
    resultType: "json",
  });

  let rows: NpsRow[] = [];
  try {
    const res = await fetch(`${NPS_BASE}?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return fallback("unknown", `국민연금 API 응답 오류: ${res.status}`);
    }
    const text = await res.text();
    // 인증 실패 시 XML 에러 메시지가 오는 경우가 있어 방어적으로 파싱
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return fallback(
        "unknown",
        "국민연금 API 인증/형식 오류 — serviceKey(디코딩 키) 확인 필요"
      );
    }
    const body = data?.response?.body ?? data?.body;
    const items = body?.items?.item ?? body?.items ?? [];
    rows = Array.isArray(items) ? items : items ? [items] : [];
  } catch (e: any) {
    return fallback("unknown", `국민연금 API 호출 실패: ${e?.message || e}`);
  }

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
