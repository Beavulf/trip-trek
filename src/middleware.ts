import { NextResponse, type NextRequest } from "next/server";
import { LAST_GROUP_COOKIE, isGroupId } from "@/lib/split/last-group";

// Гость на корне видит лендинг: rewrite, а не redirect — URL остаётся "/"
// (ссылка из био TikTok выглядит чисто), а SPA-бандл гостю не уходит.
// Вошедшие попадают в приложение как раньше; клиентский useEffect в
// src/app/page.tsx остаётся запасным путём на случай протухшей cookie.
// «Сочтёмся» (/split/*) — вход с возвратом на тот же адрес после логина; страница приглашения
// /split/join открыта и гостю: превью группы он должен увидеть ДО регистрации.
export function middleware(req: NextRequest) {
  const hasSession =
    req.cookies.has("next-auth.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token");

  if (hasSession) {
    // «Сочтёмся» открывается сразу в последней группе: частое действие — добавить трату, хаб для него лишний шаг.
    // Хаб остаётся по адресу /split?all=1 (кнопка «назад» в группе). Id в cookie проверяем шаблоном; права на
    // группу проверит сама страница (нет доступа → cookie стирается, остаётся обычный хаб)
    const { pathname, searchParams } = req.nextUrl;
    if (pathname === "/split" && !searchParams.has("all")) {
      const last = req.cookies.get(LAST_GROUP_COOKIE)?.value;
      if (isGroupId(last)) return NextResponse.redirect(new URL(`/split/${last}`, req.url));
    }
    return NextResponse.next();
  }

  // Гость на корне — лендинг по тому же адресу; остальные гостевые ветки ниже — только /split*
  const { pathname, search } = req.nextUrl;
  if (pathname === "/") return NextResponse.rewrite(new URL("/landing", req.url));

  if (pathname === "/split/join") return NextResponse.next();

  const login = new URL("/login", req.url);
  if (pathname.startsWith("/split")) login.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/split", "/split/:path*"],
};
