import type { InvestmentInfo, NewsItem } from "./types";
import { getNews } from "./naver";

/**
 * 뉴스 기반 투자 지표 추출 (추정).
 *
 * 무료 공개 API로는 투자단계/누적투자유치/투자건수를 받을 수 없으므로
 * (혁신의숲·THE VC 등은 상용 데이터), 네이버 뉴스 본문/제목에서
 * 투자 라운드와 금액 표현을 파싱해 "추정치"로 채운다.
 *
 * ⚠️ 결과는 단정이 아니라 추정이며, 반드시 원문 기사로 검증해야 한다.
 */

// 투자단계 — 뒤쪽일수록 후기 단계(우선순위 높음)
const STAGES: { re: RegExp; label: string; rank: number }[] = [
  { re: /시드|seed/i, label: "시드", rank: 1 },
  { re: /프리\s*(?:에이|a)|pre[-\s]*a/i, label: "프리 시리즈A", rank: 2 },
  { re: /시리즈\s*a|series\s*a/i, label: "시리즈 A", rank: 3 },
  { re: /시리즈\s*b|series\s*b/i, label: "시리즈 B", rank: 4 },
  { re: /시리즈\s*c|series\s*c/i, label: "시리즈 C", rank: 5 },
  { re: /시리즈\s*d|series\s*d/i, label: "시리즈 D", rank: 6 },
  { re: /시리즈\s*e|series\s*e/i, label: "시리즈 E", rank: 7 },
  { re: /상장|ipo|코스닥|코스피/i, label: "IPO/상장", rank: 8 },
];

// 투자 관련 기사인지 판별
const INVEST_HINT =
  /투자\s*유치|투자유치|펀딩|라운드|시리즈\s*[a-e]|시드|벤처투자|프리\s*(?:에이|a)|누적\s*투자|투자\s*받|조달/i;

// 금액 주변에 이 단어가 있어야 "투자금액"으로 인정
const AMOUNT_CTX = /투자|유치|펀딩|조달|라운드|시리즈|시드|출자|납입/;
// 금액 주변에 이 단어가 있으면 투자금액이 아님 (오탐 차단)
const AMOUNT_EXCLUDE =
  /시가총액|시총|기업가치|밸류|매출|거래액|거래대금|시장\s*규모|자산|영업이익|순이익|공모가|공모금액|목표주가|연봉|보수/;

const AMOUNT_RE =
  /(\d+(?:[.,]\d+)?)\s*조\s*(\d+(?:[.,]\d+)?)\s*억|(\d+(?:[.,]\d+)?)\s*조\s*원?|(\d{1,5}(?:,\d{3})*(?:\.\d+)?)\s*억\s*원?/g;

function amountValue(m: RegExpExecArray): number {
  if (m[1] && m[2]) return Number(m[1].replace(/,/g, "")) * 1e12 + Number(m[2].replace(/,/g, "")) * 1e8;
  if (m[3]) return Number(m[3].replace(/,/g, "")) * 1e12;
  if (m[4]) return Number(m[4].replace(/,/g, "")) * 1e8;
  return 0;
}

/**
 * 투자 맥락에 있는 금액만 추출.
 * 금액 토큰 앞뒤 ±18자 윈도우에 투자 단어가 있고, 제외 단어가 없을 때만 인정.
 */
function parseInvestAmount(text: string): { value: number; raw: string } | null {
  let best: { value: number; raw: string } | null = null;
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const start = Math.max(0, m.index - 18);
    const win = text.slice(start, m.index + m[0].length + 18);
    if (!AMOUNT_CTX.test(win) || AMOUNT_EXCLUDE.test(win)) continue;
    const v = amountValue(m);
    // 1조 초과 단일 투자유치는 사실상 없음 → 오탐으로 간주해 배제
    if (v <= 0 || v > 1e12) continue;
    if (!best || v > best.value) best = { value: v, raw: m[0].trim() };
  }
  return best;
}

/**
 * 뉴스 목록에서 투자 정보를 추출.
 * news를 외부에서 주입하지 않으면 "{회사명} 투자유치"로 직접 검색한다.
 */
export async function extractInvestment(
  companyName: string,
  presetNews?: NewsItem[]
): Promise<InvestmentInfo> {
  const verifyUrl = `https://thevc.kr/search?q=${encodeURIComponent(companyName)}`;
  let news: NewsItem[] = presetNews ?? [];

  // 투자 전용 검색을 추가로 수행해 신호를 높인다
  try {
    const targeted = await getNews(`${companyName} 투자유치`, 15);
    // 중복 url 제거 병합
    const seen = new Set(news.map((n) => n.url));
    for (const n of targeted) {
      if (!seen.has(n.url)) {
        news.push(n);
        seen.add(n.url);
      }
    }
  } catch {
    /* 네이버 키 미설정 등 — presetNews만으로 진행 */
  }

  const evidence: InvestmentInfo["evidence"] = [];
  let bestStage: { label: string; rank: number } | null = null;
  let maxAmount: number | null = null;

  for (const n of news) {
    const blob = `${n.title} ${n.desc}`;
    // 회사명이 본문에 등장하고 투자 관련 키워드가 있는 기사만 채택
    const mentionsCompany = blob
      .replace(/\s+/g, "")
      .toLowerCase()
      .includes(companyName.replace(/\s+/g, "").toLowerCase());
    if (!mentionsCompany || !INVEST_HINT.test(blob)) continue;

    // 단계
    for (const s of STAGES) {
      if (s.re.test(blob) && (!bestStage || s.rank > bestStage.rank)) {
        bestStage = { label: s.label, rank: s.rank };
      }
    }
    // 금액 (투자 맥락에 한함)
    const amt = parseInvestAmount(blob);
    if (amt && (maxAmount === null || amt.value > maxAmount)) {
      maxAmount = amt.value;
    }

    evidence.push({
      title: n.title,
      url: n.url,
      date: n.date,
      amountText: amt?.raw,
    });
  }

  const dealCount = evidence.length;
  const confidence = dealCount > 0 ? "estimated" : "unknown";

  return {
    stage: bestStage?.label ?? null,
    totalAmount: maxAmount,
    dealCount,
    evidence: evidence.slice(0, 8),
    source: {
      source: "네이버 뉴스 추정",
      confidence,
      verifyUrl,
      note:
        dealCount > 0
          ? "뉴스 보도 기반 추정치 — 단계/금액은 원문 및 THE VC·혁신의숲에서 검증 필요."
          : "투자 관련 보도를 찾지 못했습니다(미공개·검색 누락 가능).",
    },
  };
}
