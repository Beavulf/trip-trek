import { NextRequest, NextResponse } from "next/server";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { getSupportOptions } from "@/lib/app-config";

// GET /api/support — реквизиты для блока «Поддержать» внизу профиля (DonationAlerts, WMZ-кошелёк).
// Публичные по смыслу — их и показывают всем, кто хочет поддержать; значения валидируются при чтении.
// Платёжных данных пользователей здесь нет и быть не может.
export async function GET(req: NextRequest) {
  const limited = rateLimitMiddleware(req, "support", 60, 60_000);
  if (limited) return limited;

  return NextResponse.json(await getSupportOptions());
}
