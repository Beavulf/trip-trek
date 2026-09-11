import { NextResponse, type NextRequest } from "next/server";

// Гость, открывший корень, раньше получал полный SPA-бандл (~700 KiB) и редирект
// на /login уже на клиенте после гидратации. Теперь корень отдаёт 307 сразу,
// а клиентский useEffect в src/app/page.tsx остаётся запасным путём.
export function middleware(req: NextRequest) {
  const hasSession =
    req.cookies.has("next-auth.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token");
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
