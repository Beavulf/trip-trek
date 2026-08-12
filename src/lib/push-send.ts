import { db } from "@/lib/db";
import webpush from "web-push";

// Настройка VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:notify@triptrek.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Отправить push-уведомление всем участникам поездки
export async function sendPushToTripMembers(
  tripId: string,
  notification: { title: string; body: string; tag?: string; url?: string }
) {
  try {
    // Проверяем что VAPID настроен
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return; // Push не настроен — silent skip
    }

    // Получаем всех участников поездки
    const members = await db.tripMember.findMany({
      where: { tripId },
      select: { userId: true },
    });

    const userIds = members.map((m) => m.userId);

    // Получаем все push подписки этих пользователей
    const subscriptions = await db.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });

    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      tag: notification.tag || "triptrek",
      url: notification.url || "/",
    });

    // Отправляем каждому
    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        )
      )
    );

    // Удаляем невалидные подписки (410 Gone, 404 Not Found)
    const invalidSubs = results
      .map((r, i) => ({ result: r, sub: subscriptions[i] }))
      .filter(({ result }) => result.status === "rejected" && [404, 410].includes((result as PromiseRejectedResult).reason?.statusCode));

    if (invalidSubs.length > 0) {
      await db.pushSubscription.deleteMany({
        where: { endpoint: { in: invalidSubs.map(({ sub }) => sub.endpoint) } },
      });
    }
  } catch (e) {
    console.error("sendPushToTripMembers error:", e);
  }
}
