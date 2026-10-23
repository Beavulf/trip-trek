import { NextResponse, type NextRequest } from "next/server";

// Гость на корне видит лендинг: rewrite, а не redirect — URL остаётся "/"
// (ссылка из био TikTok выглядит чисто), а SPA-бандл гостю не уходит.
// Вошедшие попадают в приложение как раньше; клиентский useEffect в
// src/app/page.tsx остаётся запасным путём на случай протухшей cookie.
export function middleware(req: NextRequest) {
  const hasSession =
    req.cookies.has("next-auth.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token");
  if (!hasSession) {
    return NextResponse.rewrite(new URL("/landing", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
