import { db } from "@/lib/db";

// Уведомления пользователю: всегда пишем в БД (колокольчик в приложении),
// при настроенном VAPID дублируем web-push (для закрытого приложения).
// Всё fire-and-forget: сбой доставки не должен ронять основную операцию.

export type NotificationType =
  | "premium"
  | "password"
  | "member_removed"
  | "member_banned"
  | "member_unbanned"
  | "member_left"
  | "trip_deleted"
  | "feedback_reply"
  | "admin_message"
  | "ownership";

export interface NotifyPayload {
  type: NotificationType;
  title: string;
  body?: string;
  url?: string;
}

const VAPID_KEYS = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  return publicKey && privateKey ? { publicKey, privateKey } : null;
};

/** Доставить уведомление пользователю. Никогда не бросает. */
export async function notifyUser(userId: string, payload: NotifyPayload): Promise<void> {
  if (!userId) return;
  try {
    await db.userNotification.create({
      data: {
        userId,
        type: payload.type,
        title: payload.title.slice(0, 200),
        body: payload.body?.slice(0, 2000) || null,
        url: payload.url?.slice(0, 500) || null,
      },
    });
  } catch (e) {
    console.error(`[notify] failed to save ${payload.type} for ${userId}:`, e);
    return;
  }
  await sendPush(userId, payload).catch(() => {});
}

/** Web-push по всем подпискам юзера; мёртвые эндпоинты вычищаем. */
async function sendPush(userId: string, payload: NotifyPayload): Promise<void> {
  const keys = VAPID_KEYS();
  if (!keys) return; // push не настроен — уведомление ждёт в БД

  const subs = await db.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const { sendNotification } = await import("web-push");
  const json = JSON.stringify({
    title: payload.title,
    body: payload.body || "",
    url: payload.url || "/",
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json,
          {
            TTL: 86_400,
            vapidDetails: { subject: "mailto:admin@triptrek.app", ...keys },
          }
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          throw e;
        }
      }
    })
  );
}

/** Уведомить всех участников поездки, кроме одного (например, при удалении поездки). */
export async function notifyTripMembers(
  tripId: string,
  exceptUserId: string | null,
  payload: (userId: string) => NotifyPayload
): Promise<void> {
  try {
    const members = await db.tripMember.findMany({
      where: { tripId, ...(exceptUserId ? { userId: { not: exceptUserId } } : {}) },
      select: { userId: true },
    });
    await Promise.allSettled(members.map((m) => notifyUser(m.userId, payload(m.userId))));
  } catch (e) {
    console.error("[notify] notifyTripMembers failed:", e);
  }
}
