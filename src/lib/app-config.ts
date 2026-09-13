import { db } from "@/lib/db";
import { isPremiumUser } from "@/lib/premium";

// Конфиг приложения, которым управляет админ из /admin → Настройки.
// Хранится в singleton-строке AppSettings(id="app"); до первой записи
// строка может отсутствовать — тогда действуют дефолты из кода.

export interface PlanLimits {
  maxTrips: number;
  maxMembers: number;
}

export interface AppConfig {
  registrationEnabled: boolean;
  freeTripLimit: number;
  freeMemberLimit: number;
}

const DEFAULTS: AppConfig = {
  registrationEnabled: true,
  freeTripLimit: 1,
  freeMemberLimit: 5,
};

/** Текущий конфиг приложения (с дефолтами, если строка настроек ещё не создана). */
export async function getAppConfig(): Promise<AppConfig> {
  const row = await db.appSettings.findUnique({
    where: { id: "app" },
    select: { registrationEnabled: true, freeTripLimit: true, freeMemberLimit: true },
  });
  if (!row) return { ...DEFAULTS };
  return {
    registrationEnabled: row.registrationEnabled ?? DEFAULTS.registrationEnabled,
    freeTripLimit: Math.max(0, row.freeTripLimit ?? DEFAULTS.freeTripLimit),
    freeMemberLimit: Math.max(1, row.freeMemberLimit ?? DEFAULTS.freeMemberLimit),
  };
}

/** Лимиты free-плана (для /api/limits и /api/trips/join). */
export async function getPlanLimits(): Promise<PlanLimits> {
  const cfg = await getAppConfig();
  return { maxTrips: cfg.freeTripLimit, maxMembers: cfg.freeMemberLimit };
}

/**
 * Единый гейт создания поездки по лимиту free-плана.
 * Аудит 2026-09-12: проверка была только в /api/limits и from-template, а
 * POST /api/trips и /api/trip/import создавали поездки без лимита —
 * теперь все пути создания зовут этот хелпер.
 */
export async function tripCreateGate(
  userId: string
): Promise<{ ok: true } | { ok: false; current: number; maxTrips: number }> {
  const ownerUser = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiry: true },
  });
  if (!ownerUser || !isPremiumUser(ownerUser)) {
    const count = await db.tripMember.count({ where: { userId, role: "owner" } });
    const { maxTrips } = await getPlanLimits();
    if (count >= maxTrips) return { ok: false, current: count, maxTrips };
  }
  return { ok: true };
}
