import { NextRequest, NextResponse } from "next/server";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { getPublicShowcase } from "@/lib/app-config";

// GET /api/auth/register-options — публичный режим регистрации. Форма /login берёт те же данные на сервере
// (login/page.tsx → getPublicShowcase), роут оставлен для внешних клиентов.
// 60/мин/IP: публичный и дешёвый, в отличие от самой регистрации (20/ч/IP).
// contactTelegram здесь же — «застряли? напишите»
export async function GET(req: NextRequest) {
  const rateLimit = rateLimitMiddleware(req, "register-options", 60, 60_000);
  if (rateLimit) return rateLimit;

  const showcase = await getPublicShowcase();
  return NextResponse.json({
    registrationEnabled: showcase.registrationEnabled,
    inviteRequired: showcase.inviteRequired,
    contactTelegram: showcase.contactTelegram,
  });
}
