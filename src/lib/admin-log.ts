import { db } from "@/lib/db";

// Журнал действий админа. Пишется из каждого /api/admin/* мутационного роута.
// Ошибка записи лога НЕ должна ронять основную операцию — поэтому try/catch.

export type AdminAction =
  | "user.premium"
  | "user.role"
  | "user.edit"
  | "user.password"
  | "user.delete"
  | "user.message"
  | "trip.edit"
  | "trip.delete"
  | "trip.invite_regen"
  | "trip.member_remove"
  | "trip.ban"
  | "trip.unban"
  | "trip.transfer"
  | "feedback.status"
  | "feedback.note"
  | "feedback.reply"
  | "feedback.delete"
  | "settings.ai"
  | "settings.app"
  | "storage.purge";

export interface AdminLogTarget {
  type: "user" | "trip" | "feedback" | "settings" | "storage";
  id?: string;
  label?: string;
}

/** Записать действие в журнал. Никогда не бросает. meta — только счётчики/суммы, не секреты. */
export async function logAdmin(
  adminId: string,
  action: AdminAction,
  target: AdminLogTarget,
  meta?: Record<string, unknown>
): Promise<void> {
  try {
    await db.adminLog.create({
      data: {
        adminId,
        action,
        targetType: target.type,
        targetId: target.id ?? null,
        targetLabel: target.label ?? null,
        meta: meta === undefined ? undefined : (meta as object),
      },
    });
  } catch (e) {
    console.error(`[admin-log] failed to write ${action}:`, e);
  }
}
