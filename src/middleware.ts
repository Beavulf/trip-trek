import { NextResponse, type NextRequest } from "next/server";
import { LAST_GROUP_COOKIE, isGroupId } from "@/lib/split/last-group";

// Гость, открывший корень, раньше получал полный SPA-бандл (~700 KiB) и редирект
// на /login уже на клиенте после гидратации. Теперь корень отдаёт 307 сразу,
// а клиентский useEffect в src/app/page.tsx остаётся запасным путём.
// «Сочтёмся» (/split/*) — то же, но с возвратом на тот же адрес после входа; страница приглашения
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

  const { pathname, search } = req.nextUrl;
  if (pathname === "/split/join") return NextResponse.next();

  const login = new URL("/login", req.url);
  if (pathname.startsWith("/split")) login.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/", "/split", "/split/:path*"],
};
