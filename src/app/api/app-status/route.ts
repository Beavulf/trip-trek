import { NextRequest, NextResponse } from "next/server";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { getMaintenanceState } from "@/lib/maintenance-state";
import { getUserFromRequest } from "@/lib/api-auth";
import type { SiteStatus } from "@/lib/maintenance";

// GET /api/app-status — публичный статус для клиента: баннер-объявление и заглушка техработ.
// Открыт гостю и доступен даже в режиме техработ (см. isMaintenanceExempt) — иначе открытая
// вкладка не узнала бы, что работы закончились. Клиент опрашивает его раз в минуту.
export async function GET(req: NextRequest) {
  const limited = rateLimitMiddleware(req, "app-status", 120, 60_000);
  if (limited) return limited;

  const state = await getMaintenanceState();
  let admin = false;
  if (state.on) {
    const user = await getUserFromRequest(req);
    admin = Boolean(user && state.adminIds.has(user.id));
  }

  const body: SiteStatus = {
    maintenance: state.on,
    message: state.message,
    announcement: state.announcement,
    admin,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
