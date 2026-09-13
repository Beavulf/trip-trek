import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { rateLimitMiddleware } from "@/lib/rate-limit";

const handler = NextAuth(authOptions);

// Лимитер и на параллельном входе NextAuth: его Credentials-callback делает
// bcrypt-сравнение на каждый запрос и собственного троттлинга не имеет —
// без обёртки это неограниченный перебор паролей в обход лимита custom-login
// (аудит 2026-09-12: auth.nextauth-credentials.unthrottled-login).
const throttledPost = async (req: Parameters<typeof handler>[0]) => {
  const limited = rateLimitMiddleware(req, "login", 5, 15 * 60_000);
  if (limited) return limited;
  return handler(req);
};

export { handler as GET, throttledPost as POST };
