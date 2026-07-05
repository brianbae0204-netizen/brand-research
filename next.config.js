/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // DART 회사코드 캐시(cache/corp_codes.json)를 서버리스 함수 번들에 포함시켜
  // Vercel에서 매 요청마다 수십 MB zip을 재다운로드하지 않도록 한다.
  experimental: {
    outputFileTracingIncludes: {
      "/api/**": ["./cache/corp_codes.json"],
    },
  },
};
module.exports = nextConfig;
