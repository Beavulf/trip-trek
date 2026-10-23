import { NextResponse, type NextRequest } from "next/server";

// Гость, открывший корень, раньше получал полный SPA-бандл (~700 KiB) и редирект
// на /login уже на клиенте после гидратации. Теперь корень отдаёт 307 сразу,
// а клиентский useEffect в src/app/page.tsx остаётся запасным путём.
// «Сочтёмся» (/split/*) — то же, но с возвратом на тот же адрес после входа; страница приглашения
// /split/join открыта и гостю: превью группы он должен увидеть ДО регистрации.
export function middleware(req: NextRequest) {
  const hasSession =
    req.cookies.has("next-auth.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token");
  if (hasSession) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname === "/split/join") return NextResponse.next();

  const login = new URL("/login", req.url);
  if (pathname.startsWith("/split")) login.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/split", "/split/:path*"],
};
