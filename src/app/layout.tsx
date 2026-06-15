import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "브랜드 리서치 워크벤치 — CJ ENM 성장추진팀",
  description: "브랜드/법인명을 입력하면 재무·투자·고용·사업자 정보를 한 화면에 자동 수집",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6366f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
