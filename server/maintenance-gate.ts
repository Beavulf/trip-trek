import type { IncomingMessage, ServerResponse } from "http";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../src/lib/api-auth";
import { isMaintenanceExempt, maintenanceHtml } from "../src/lib/maintenance";
import { getMaintenanceState, type MaintenanceState } from "../src/lib/maintenance-state";

// Гейт режима техработ: стоит в server.ts перед Next. Пока админ держит режим включённым, все,
// кроме админов, получают 503 (JSON для /api, страница-заглушка для остального) — приложение
// вообще не отдаёт им данные. Админ узнаётся по JWT из cookie сессии и списку админов из state.
// Это только «видимость»: права на действия админ-роутов по-прежнему проверяет requireAdmin.

const RETRY_AFTER_SECONDS = 30;

function isAdminRequest(req: IncomingMessage, state: MaintenanceState): boolean {
  const token = /(?:^|;\s*)next-auth\.session-token=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  if (!token) return false;
  try {
    const payload = jwt.verify(decodeURIComponent(token), getJwtSecret(), {
      algorithms: ["HS256"], // как в api-auth
    }) as { id?: string };
    return Boolean(payload.id) && state.adminIds.has(payload.id as string);
  } catch {
    return false;
  }
}

/** true — запрос обработан гейтом (503), дальше Next его не получает. */
export async function handleMaintenance(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = (req.url ?? "/").split("?")[0];
  if (isMaintenanceExempt(pathname)) return false;

  const state = await getMaintenanceState();
  if (!state.on || !state.message || isAdminRequest(req, state)) return false;

  const wantsPage = !pathname.startsWith("/api/") && (req.method === "GET" || req.method === "HEAD");
  res.statusCode = 503;
  res.setHeader("Retry-After", String(RETRY_AFTER_SECONDS));
  res.setHeader("Cache-Control", "no-store");
  if (wantsPage) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(req.method === "HEAD" ? undefined : maintenanceHtml(state.message));
  } else {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: state.message, maintenance: true }));
  }
  return true;
}
