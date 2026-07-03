import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 사이트 전체 비밀번호 보호 (HTTP Basic Auth).
 *
 * - 환경변수 SITE_PASSWORD 가 설정된 경우에만 동작한다.
 *   (로컬 개발 시에는 보통 미설정 → 그냥 통과)
 * - 아이디는 SITE_USER(기본값 "cj")를 사용한다.
 * - 배포 환경(Vercel)에서는 SITE_PASSWORD 를 반드시 등록해야 보호가 켜진다.
 */
export function middleware(req: NextRequest) {
  const PASSWORD = process.env.SITE_PASSWORD;
  // 비밀번호가 설정되지 않았으면 보호하지 않음 (로컬 개발 편의)
  if (!PASSWORD) return NextResponse.next();

  const USER = process.env.SITE_USER || "cj";

  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      // Edge 런타임: atob 사용 가능
      const decoded = atob(encoded);
      const idx = decoded.indexOf(":");
      const user = decoded.slice(0, idx);
      const pass = decoded.slice(idx + 1);
      if (user === USER && pass === PASSWORD) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("인증이 필요합니다.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="브랜드 리서치 워크벤치", charset="UTF-8"',
    },
  });
}

// 정적 파일·favicon 등은 인증에서 제외
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
