import { db } from "@/lib/db";
import { MAINTENANCE_DEFAULT_MESSAGE, normalizeNotice } from "@/lib/maintenance";

// Состояние режима техработ с кэшем на 3 секунды. Читают его serverный гейт (server.ts, каждый
// запрос к странице/API) и роуты Next. Это РАЗНЫЕ webpack-бандлы одного процесса, поэтому кэш лежит
// на globalThis: иначе сброс из PUT /api/admin/settings не дошёл бы до гейта и режим включался бы
// с задержкой до TTL. Список админов грузим только пока режим включён.

const TTL_MS = 3_000;

export interface MaintenanceState {
  on: boolean;
  /** Текст заглушки (свой или стандартный); null, пока режим выключен. */
  message: string | null;
  announcement: string | null;
  adminIds: ReadonlySet<string>;
}

interface Cache {
  state: MaintenanceState;
  at: number;
  loading: Promise<MaintenanceState> | null;
}

const KEY = "__triptrekMaintenance";
type G = typeof globalThis & { [KEY]?: Cache };

const OFF: MaintenanceState = { on: false, message: null, announcement: null, adminIds: new Set() };

function cache(): Cache {
  const g = globalThis as G;
  return (g[KEY] ??= { state: OFF, at: 0, loading: null });
}

async function load(): Promise<MaintenanceState> {
  const row = await db.appSettings.findUnique({
    where: { id: "app" },
    select: { maintenanceMode: true, maintenanceMessage: true, announcement: true },
  });
  const announcement = normalizeNotice(row?.announcement);
  if (!row?.maintenanceMode) return { on: false, message: null, announcement, adminIds: new Set() };
  const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true } });
  return {
    on: true,
    message: normalizeNotice(row.maintenanceMessage) ?? MAINTENANCE_DEFAULT_MESSAGE,
    announcement,
    adminIds: new Set(admins.map((a) => a.id)),
  };
}

/**
 * Текущее состояние. Сбой БД не должен ронять сайт «из-за техработ»: отдаём последнее известное
 * (а если его не было — «выключено»), следующая попытка через TTL.
 */
export async function getMaintenanceState(): Promise<MaintenanceState> {
  const c = cache();
  if (Date.now() - c.at < TTL_MS) return c.state;
  c.loading ??= load()
    .then((state) => {
      c.state = state;
      return state;
    })
    .catch(() => c.state)
    .finally(() => {
      c.at = Date.now();
      c.loading = null;
    });
  return c.loading;
}

/** Админ сохранил настройки — следующий запрос перечитает БД. */
export function resetMaintenanceState(): void {
  cache().at = 0;
}
