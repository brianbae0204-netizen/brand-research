import type { NewsItem, ShoppingItem } from "./types";

const ID = process.env.NAVER_CLIENT_ID?.trim() || "";
const SECRET = process.env.NAVER_CLIENT_SECRET?.trim() || "";

function stripHtml(s: string): string {
  return (s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

async function call(kind: "news" | "blog" | "shop", query: string, display = 10) {
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

export function isNaverConfigured() {
  return Boolean(ID && SECRET);
}
