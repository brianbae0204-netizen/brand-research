/**
 * e커머스 플랫폼 데이터 수집
 *
 * 소스:
 *  1. 올리브영 — 브랜드 검색 결과 (상품 수, 리뷰 수, 순위 여부)
 *  2. 쿠팡 — 상품 검색 + 리뷰 통계
 *
 * ⚠️ 스크레이핑 기반 — 사이트 구조 변경 시 파싱 실패 가능. 오류 시 null 반환.
 */

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9",
  Referer: "https://www.oliveyoung.co.kr/",
};

async function fetchHtml(url: string, extraHeaders: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { ...HEADERS, ...extraHeaders },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────
// 올리브영
// ─────────────────────────────────────────────────────────────

export interface OliveYoungData {
  productCount: number;
  topProducts: {
    name: string;
    brand: string;
    price: number;
    reviewCount: number;
  }[];
  bestRankProducts: {
    rank: number;
    name: string;
    brand: string;
  }[];
  isInBest: boolean;
  sourceUrl: string;
}

/** 올리브영 브랜드 검색 결과 수집 */
export async function scrapeOliveYoung(brandName: string): Promise<OliveYoungData | null> {
  const searchUrl = `https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query=${encodeURIComponent(brandName)}&onlyCnt=0&cate1Id=&cate2Id=`;

  const html = await fetchHtml(searchUrl, { Referer: "https://www.oliveyoung.co.kr/" });
  if (!html) return null;

  const topProducts: OliveYoungData["topProducts"] = [];

  // 상품 카드 파싱 — 올리브영 SSR HTML 구조
  // <li class="li_good"> ... <p class="tx_brand">브랜드</p> <p class="tx_name">제품명</p>
  // <span class="tx_cur"><span class="tx_num">가격</span></span>
  // <span class="review">리뷰수</span>

  const prodRe = /<li[^>]*class="[^"]*li_good[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;

  while ((m = prodRe.exec(html)) !== null && topProducts.length < 10) {
    const block = m[1];

    const brandMatch = block.match(/<p[^>]*class="[^"]*tx_brand[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const nameMatch = block.match(/<p[^>]*class="[^"]*tx_name[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const priceMatch = block.match(/<span[^>]*class="[^"]*tx_num[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const reviewMatch = block.match(/(\d[\d,]+)\s*개?\s*리뷰|리뷰\s*(\d[\d,]+)|<span[^>]*class="[^"]*review[^"]*"[^>]*>\(?([\d,]+)\)?<\/span>/i);

    const pName = nameMatch ? stripTags(nameMatch[1]) : "";
    const pBrand = brandMatch ? stripTags(brandMatch[1]) : brandName;
    const pPrice = priceMatch ? Number(stripTags(priceMatch[1]).replace(/,/g, "")) : 0;
    const pReview = reviewMatch
      ? Number((reviewMatch[3] || reviewMatch[2] || reviewMatch[1] || "0").replace(/,/g, ""))
      : 0;

    if (pName.length > 1) topProducts.push({ name: pName, brand: pBrand, price: pPrice, reviewCount: pReview });
  }

  // 총 상품 수 추출
  const countMatch = html.match(/총\s*<strong[^>]*>(\d[\d,]*)<\/strong>|검색결과\s*(\d[\d,]+)건|(\d[\d,]+)개의\s*상품/);
  const productCount = countMatch
    ? Number((countMatch[3] || countMatch[2] || countMatch[1] || "0").replace(/,/g, ""))
    : topProducts.length;

  // 올리브영 베스트 랭킹에서 브랜드 확인 (카테고리별 Top10)
  const bestRankProducts: OliveYoungData["bestRankProducts"] = [];
  const bestHtml = await fetchHtml(
    `https://www.oliveyoung.co.kr/store/main/getBestList.do?onlyCnt=0&cate1Id=10000010000`,
    { Referer: "https://www.oliveyoung.co.kr/" }
  );
  if (bestHtml) {
    const rankRe = /<li[^>]*class="[^"]*li_good[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let rank = 0;
    let rm: RegExpExecArray | null;
    while ((rm = rankRe.exec(bestHtml)) !== null && rank < 20) {
      rank++;
      const block = rm[1];
      const bBrandMatch = block.match(/<p[^>]*class="[^"]*tx_brand[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
      const bNameMatch = block.match(/<p[^>]*class="[^"]*tx_name[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
      const bBrand = bBrandMatch ? stripTags(bBrandMatch[1]) : "";
      const bName = bNameMatch ? stripTags(bNameMatch[1]) : "";
      if (bBrand.toLowerCase().includes(brandName.toLowerCase()) ||
          bName.toLowerCase().includes(brandName.toLowerCase())) {
        bestRankProducts.push({ rank, name: bName, brand: bBrand });
      }
    }
  }

  if (productCount === 0 && topProducts.length === 0) return null;

  return {
    productCount,
    topProducts,
    bestRankProducts,
    isInBest: bestRankProducts.length > 0,
    sourceUrl: searchUrl,
  };
}

// ─────────────────────────────────────────────────────────────
// 쿠팡
// ─────────────────────────────────────────────────────────────

export interface CoupangData {
  productCount: number;
  topProducts: {
    name: string;
    price: number;
    reviewCount: number;
    rating: number;
    isRocketDelivery: boolean;
  }[];
  avgRating: number;
  totalReviews: number;
  rocketDeliveryCount: number;
  sourceUrl: string;
}

/** 쿠팡 브랜드 검색 결과 수집 */
export async function scrapeCoupang(brandName: string): Promise<CoupangData | null> {
  const searchUrl = `https://www.coupang.com/np/search?component=&q=${encodeURIComponent(brandName)}&channel=user&from=pc`;

  const html = await fetchHtml(searchUrl, {
    Referer: "https://www.coupang.com/",
    Accept: "text/html,application/xhtml+xml",
  });
  if (!html) return null;

  const topProducts: CoupangData["topProducts"] = [];

  // 쿠팡 검색 결과 — JSON-LD 또는 __NEXT_DATA__ 에서 상품 데이터 추출 시도
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const items = nextData?.props?.pageProps?.searchResult?.productData?.data ?? [];
      for (const item of items.slice(0, 10)) {
        topProducts.push({
          name: item.productName ?? item.name ?? "",
          price: Number(item.salePrice ?? item.price ?? 0),
          reviewCount: Number(item.productReviewCount ?? item.ratingTotalCount ?? 0),
          rating: Number(item.productRating ?? item.averageRating ?? 0),
          isRocketDelivery: Boolean(item.isRocketDelivery ?? item.rocket),
        });
      }
    } catch {
      /* fallback to HTML parsing */
    }
  }

  // HTML 직접 파싱 (NEXT_DATA 실패 시)
  if (topProducts.length === 0) {
    // 쿠팡 상품 카드: <li class="search-product ...">
    const itemRe = /<li[^>]*class="[^"]*search-product[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(html)) !== null && topProducts.length < 10) {
      const block = m[1];
      const nameMatch = block.match(/class="[^"]*name[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i);
      const priceMatch = block.match(/class="[^"]*price[^"]*"[^>]*>[\s\S]*?(\d[\d,]+)원/i);
      const reviewMatch = block.match(/(\d[\d,]+)\s*개?\s*리뷰|리뷰\s*(\d[\d,]+)/i);
      const ratingMatch = block.match(/(\d\.\d)\s*점|rating[^>]*>(\d\.\d)/i);
      const isRocket = /rocket|로켓/i.test(block);

      const name = nameMatch ? stripTags(nameMatch[1]) : "";
      if (!name || name.length < 2) continue;

      topProducts.push({
        name,
        price: priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : 0,
        reviewCount: reviewMatch ? Number((reviewMatch[2] || reviewMatch[1]).replace(/,/g, "")) : 0,
        rating: ratingMatch ? Number(ratingMatch[2] || ratingMatch[1]) : 0,
        isRocketDelivery: isRocket,
      });
    }
  }

  // 총 상품 수
  const countMatch = html.match(/총\s*<[^>]*>(\d[\d,]*)<\/[^>]*>|(\d[\d,]+)개의\s*상품|검색결과\s*(\d[\d,]+)/);
  const productCount = countMatch
    ? Number((countMatch[3] || countMatch[2] || countMatch[1] || "0").replace(/,/g, ""))
    : topProducts.length;

  const totalReviews = topProducts.reduce((s, p) => s + p.reviewCount, 0);
  const ratedProducts = topProducts.filter((p) => p.rating > 0);
  const avgRating = ratedProducts.length > 0
    ? Math.round((ratedProducts.reduce((s, p) => s + p.rating, 0) / ratedProducts.length) * 10) / 10
    : 0;
  const rocketDeliveryCount = topProducts.filter((p) => p.isRocketDelivery).length;

  if (productCount === 0 && topProducts.length === 0) return null;

  return {
    productCount,
    topProducts,
    avgRating,
    totalReviews,
    rocketDeliveryCount,
    sourceUrl: searchUrl,
  };
}

// ─────────────────────────────────────────────────────────────
// 네이버 쇼핑 데이터에서 쿠팡 존재감 계산 (이미 수집된 데이터 활용)
// ─────────────────────────────────────────────────────────────
import type { ShoppingItem } from "./types";

export function analyzeCoupangFromNaverShopping(shopping: ShoppingItem[]): {
  coupangProductCount: number;
  coupangAvgPrice: number;
  hasCoupangPresence: boolean;
} {
  const coupangItems = shopping.filter(
    (s) => s.mall?.toLowerCase().includes("쿠팡") || s.url?.includes("coupang.com")
  );
  const avgPrice = coupangItems.length > 0
    ? Math.round(coupangItems.reduce((s, i) => s + i.price, 0) / coupangItems.length)
    : 0;
  return {
    coupangProductCount: coupangItems.length,
    coupangAvgPrice: avgPrice,
    hasCoupangPresence: coupangItems.length > 0,
  };
}
