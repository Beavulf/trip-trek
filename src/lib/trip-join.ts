import { db } from "@/lib/db";
import { getPlanLimits } from "@/lib/app-config";
import { isPremiumUser } from "@/lib/premium";

/**
 * Единые проверки вступления в поездку: бан, повторное членство, лимит владельца.
 * Аудит 2026-09-12: register-автоджойн дублировал join без этих проверок —
 * теперь оба пути идут через одну функцию, расхождение невозможно.
 */
export async function checkCanJoinTrip(
  tripId: string,
  userId: string
): Promise<{ ok: true; members: number } | { ok: false; status: number; error: string; extra?: Record<string, unknown> }> {
  // Забаненному в этой поездке вход закрыт (утёкшая ссылка и т.п.)
  const ban = await db.tripBan.findUnique({
    where: { tripId_userId: { tripId, userId } },
  });
  if (ban) {
    return {
      ok: false,
      status: 403,
      error: "Вас заблокировали в этой поездке. Свяжись с владельцем или админом.",
      extra: { banned: true },
    };
  }

  const members = await db.tripMember.findMany({
    where: { tripId },
    select: { userId: true, role: true },
  });

  // Уже участник — ок (идемпотентность)
  if (members.some((m) => m.userId === userId)) {
    return { ok: true, members: members.length };
  }

  // Лимит участников — по плану ВЛАДЕЛЬЦА поездки
  const owner = members.find((m) => m.role === "owner");
  if (owner) {
    const ownerUser = await db.user.findUnique({ where: { id: owner.userId } });
    if (!ownerUser || !isPremiumUser(ownerUser)) {
      const { maxMembers } = await getPlanLimits();
      if (members.length >= maxMembers) {
        return {
          ok: false,
          status: 403,
          error: `Лимит участников (${maxMembers}) исчерпан. Владелец поездки может перейти на Premium.`,
          extra: { upgrade: true, current: members.length, max: maxMembers },
        };
      }
    }
  }

  return { ok: true, members: members.length };
}
