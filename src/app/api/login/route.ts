import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 로그인 처리 — 비밀번호가 맞으면 site_auth 쿠키를 설정하고 홈으로 이동.
 * 틀리면 로그인 폼으로 되돌아가며 에러(?e=1)를 표시한다.
 */
export async function POST(req: Request) {
  const PASSWORD = process.env.SITE_PASSWORD;
  const origin = new URL(req.url).origin;

  // 보호가 꺼져 있으면 그냥 홈으로
  if (!PASSWORD) return NextResponse.redirect(new URL("/", origin), 303);

  let password = "";
  try {
    const form = await req.formData();
    password = String(form.get("password") || "");
  } catch {
    password = "";
  }

  if (password === PASSWORD) {
    const res = NextResponse.redirect(new URL("/", origin), 303);
    res.cookies.set("site_auth", PASSWORD, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30일
    });
    return res;
  }

  return NextResponse.redirect(new URL("/?e=1", origin), 303);
}
