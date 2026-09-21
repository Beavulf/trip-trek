import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { rateLimitMiddleware } from "@/lib/rate-limit";

const handler = NextAuth(authOptions);

// Лимитер и на параллельном входе NextAuth: его Credentials-callback делает
// bcrypt-сравнение на каждый запрос и собственного троттлинга не имеет —
// без обёртки это неограниченный перебор паролей в обход лимита custom-login
// (аудит 2026-09-12: auth.nextauth-credentials.unthrottled-login).
// Context обязателен к пробросу: next-auth v4 по ЧИСЛУ аргументов выбирает ветку —
// без второго аргумента уходит в Pages-обработчик и падает на req.query
// (POST /api/auth/callback/* отдавал 500 «Cannot destructure property 'nextauth'»).
async function throttledPost(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> }
) {
  const limited = rateLimitMiddleware(req, "login", 5, 15 * 60_000);
  if (limited) return limited;
  return handler(req, ctx);
}

export { handler as GET, throttledPost as POST };
