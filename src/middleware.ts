import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 사이트 전체 비밀번호 보호 (쿠키 기반 로그인 페이지).
 *
 * - 환경변수 SITE_PASSWORD 가 설정된 경우에만 동작한다.
 *   (로컬 개발 시에는 보통 미설정 → 그냥 통과)
 * - 쿠키 site_auth 값이 SITE_PASSWORD 와 일치하면 통과.
 * - 아니면 로그인 HTML 폼을 보여준다. 폼은 /api/login 으로 제출된다.
 */
const COOKIE = "site_auth";

function loginPage(error: boolean): NextResponse {
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>브랜드 리서치 워크벤치</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #4f46e5 0%, #ec4899 100%);
      padding: 20px;
    }
    .card {
      background: #fff; border-radius: 20px; padding: 40px 32px;
      width: 100%; max-width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.25);
      text-align: center;
    }
    .logo { font-size: 40px; margin-bottom: 12px; }
    h1 { font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
    p.sub { font-size: 13px; color: #64748b; margin-bottom: 28px; }
    input {
      width: 100%; padding: 14px 16px; font-size: 15px;
      border: 1.5px solid #e2e8f0; border-radius: 12px; outline: none;
      transition: border-color .15s;
    }
    input:focus { border-color: #6366f1; }
    button {
      width: 100%; margin-top: 14px; padding: 14px; font-size: 15px; font-weight: 700;
      color: #fff; background: linear-gradient(135deg, #6366f1, #ec4899);
      border: none; border-radius: 12px; cursor: pointer;
    }
    button:hover { opacity: .92; }
    .err { color: #ef4444; font-size: 13px; margin-top: 14px; }
  </style>
</head>
<body>
  <form class="card" method="POST" action="/api/login">
    <div class="logo">🔒</div>
    <h1>브랜드 리서치 워크벤치</h1>
    <p class="sub">CJ ENM 성장추진팀 · 접속 비밀번호를 입력하세요</p>
    <input type="password" name="password" placeholder="비밀번호" autofocus autocomplete="current-password" />
    <button type="submit">입장</button>
    ${error ? '<p class="err">비밀번호가 올바르지 않습니다.</p>' : ""}
  </form>
</body>
</html>`;
  return new NextResponse(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export function middleware(req: NextRequest) {
  const PASSWORD = process.env.SITE_PASSWORD;
  // 비밀번호가 설정되지 않았으면 보호하지 않음 (로컬 개발 편의)
  if (!PASSWORD) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // 로그인 처리 API 는 검증 대상에서 제외 (여기서 막으면 로그인이 불가능)
  if (pathname === "/api/login") return NextResponse.next();

  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie === PASSWORD) return NextResponse.next();

  return loginPage(req.nextUrl.searchParams.get("e") === "1");
}

// 정적 파일·favicon 등은 인증에서 제외
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
