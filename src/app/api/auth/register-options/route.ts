import { NextRequest, NextResponse } from "next/server";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { getPublicShowcase } from "@/lib/app-config";

// GET /api/auth/register-options — публичный режим регистрации для формы /login.
// 60/мин/IP: страница логина дёргает его на каждом заходе (в отличие от самой
// регистрации, где 3/ч/IP). contactTelegram здесь же — футер «застряли? напишите»
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
