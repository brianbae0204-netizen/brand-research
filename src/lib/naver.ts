import type { NewsItem, ShoppingItem } from "./types";

const ID = process.env.NAVER_CLIENT_ID?.trim() || "";
const SECRET = process.env.NAVER_CLIENT_SECRET?.trim() || "";

function stripHtml(s: string): string {
  return (s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

async function call(kind: "news" | "blog" | "shop" | "webkr", query: string, display = 10) {
  if (!ID || !SECRET) return null;
  const url = `https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(query)}&display=${display}&sort=${kind === "news" ? "date" : "sim"}`;
  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.items as any[] | undefined;
}

export async function getNews(query: string, n = 8): Promise<NewsItem[]> {
  const items = (await call("news", query, n)) || [];
  return items.map((x) => ({
    title: stripHtml(x.title),
    desc: stripHtml(x.description),
    url: x.originallink || x.link,
    date: x.pubDate,
  }));
}

export async function getBlogs(query: string, n = 6): Promise<NewsItem[]> {
  const items = (await call("blog", query, n)) || [];
  return items.map((x) => ({
    title: stripHtml(x.title),
    desc: stripHtml(x.description),
    url: x.link,
    blogger: x.bloggername,
    date: x.postdate,
  }));
}

export async function getShopping(query: string, n = 12): Promise<ShoppingItem[]> {
  const items = (await call("shop", query, n)) || [];
  return items.map((x) => ({
    title: stripHtml(x.title),
    price: Number(x.lprice) || 0,
    mall: x.mallName,
    url: x.link,
    image: x.image,
    category: x.category1,
  }));
}

// 공식 홈페이지 후보에서 제외할 도메인 (포털·SNS·뉴스·쇼핑몰 등)
const NON_OFFICIAL = [
  "naver.", "daum.", "google.", "youtube.", "instagram.", "facebook.",
  "tistory.", "blog.", "cafe.", "wikipedia.", "namu.wiki", "linkedin.",
  "jobkorea.", "saramin.", "wanted.", "catch.", "thevc.", "innoforest.",
  "coupang.", "11st.", "gmarket.", "auction.", "news", "post.naver",
  "dart.fss", "sminfo.", "ftc.go.kr", "twitter.", "x.com", "kakao.",
];

// 뉴스/기사/게시판 등 공식 홈페이지가 아닌 URL 경로 패턴
const ARTICLE_PATH = /(news|article|view|bbs|board|read|entry|post|press|magazine|story|\.html?$)/i;
// 흔한 언론사 도메인 꼬리 (대표적인 것만)
const PRESS_HOST = /(press|news|ilbo|times|today|biz|economy|herald|edaily|mt\.co|chosun|joins|hankyung|mk\.co|ytn|sbs|kbs|mbc|newsis|yna|zdnet|etnews|inews|dailian|kdpress)/i;

/**
 * 네이버 웹문서 검색으로 공식 홈페이지를 추정.
 * - 언론사/포털/게시판/기사 URL 은 배제
 * - 루트 경로에 가까운(기사가 아닌) 도메인을 우선
 * 확신이 낮으면 null 을 반환(뉴스 링크를 홈페이지로 오인하지 않도록).
 */
export async function findHomepage(companyName: string): Promise<string | null> {
  const items = (await call("webkr", `${companyName} 공식 홈페이지`, 15)) || [];
  type Cand = { url: string; host: string; pathLen: number };
  const candidates: Cand[] = [];
  for (const x of items) {
    const link: string = x.link || "";
    if (!/^https?:\/\//.test(link)) continue;
    let u: URL;
    try {
      u = new URL(link);
    } catch {
      continue;
    }
    const host = u.hostname.replace(/^www\./, "");
    if (NON_OFFICIAL.some((d) => host.includes(d))) continue;
    if (PRESS_HOST.test(host)) continue;
    if (u.search) continue; // 쿼리스트링 있으면 기사일 확률 높음
    if (ARTICLE_PATH.test(u.pathname)) continue;
    const pathLen = u.pathname.replace(/\/+$/, "").length;
    if (pathLen > 12) continue; // 경로가 길면 기사/상세페이지
    candidates.push({ url: `https://${host}`, host, pathLen });
  }
  if (candidates.length === 0) return null;
  // 루트 경로에 가장 가까운 도메인 우선
  candidates.sort((a, b) => a.pathLen - b.pathLen);
  return candidates[0].url;
}

export function isNaverConfigured() {
  return Boolean(ID && SECRET);
}

/**
 * 홈페이지 URL에서 텍스트를 추출 (meta description + og:description + body 텍스트).
 * AI 기업 소개 생성 시 뉴스보다 신뢰도 높은 1차 소스로 활용.
 */
export async function fetchHomepageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // meta description (순서 무관 속성)
    const metaDesc =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,500})["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']{10,500})["'][^>]+name=["']description["']/i)?.[1] || "";
    const ogDesc =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{10,500})["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']{10,500})["'][^>]+property=["']og:description["']/i)?.[1] || "";
    // body 순수 텍스트 (스크립트·스타일 제거)
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2500);
    const parts = [metaDesc, ogDesc, body].filter(Boolean);
    return parts.length > 0 ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}
