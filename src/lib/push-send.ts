import { db } from "@/lib/db";
import webpush from "web-push";
import { logger } from "@/lib/logger";
import { shouldRetryPush, PUSH_RETRY_DELAY_MS } from "@/lib/push-retry";

// Настройка VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:notify@triptrek.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/** Подписка в терминах web-push (поля строки PushSubscription из БД). */
export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Исход доставки: sent — принята пуш-сервером; gone — подписка мертва (404/410); failed — потерян после ретрая. */
export type PushOutcome = "sent" | "gone" | "failed";

/**
 * Доставить один пуш: попытка + ровно один ретрай на транзиентные ошибки.
 * Google FCM из РФ деградирован (проба 2026-09-24: каждый 4-й запрос —
 * 10-секундный таймаут), а до 2026-09-24 сбои молча выбрасывались — часть
 * пушей терялась незаметно. TTL по умолчанию сутки: событие, не доехавшее
 * за день, бесполезно (дефолт web-push — 4 недели, отсюда «вчерашние»
 * пуши пачкой). Никогда не бросает.
 */
export async function deliverPush(
  sub: PushSubscriptionInput,
  payload: string,
  { ttl = 86_400 }: { ttl?: number } = {}
): Promise<PushOutcome> {
  for (let attempt = 1; ; attempt++) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        {
          TTL: ttl,
          // дедлайн обязателен: endpoint задаёт клиент, зависший отправитель
          // тормозил бы ждущий его код (аудит 2026-09-12)
          timeout: 10_000,
        }
      );
      return "sent";
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone";
      if (attempt === 1 && shouldRetryPush(status)) {
        await new Promise((resolve) => setTimeout(resolve, PUSH_RETRY_DELAY_MS));
        continue;
      }
      // endpoint маскируем: в нём зашит токен подписки
      logger.warn("push: delivery failed", {
        endpoint: `…${sub.endpoint.slice(-12)}`,
        status: status ?? "network",
        attempt,
        error: e instanceof Error ? e.message : String(e),
      });
      return "failed";
    }
  }
}

/** Одна строка лога на фан-аут — видно реальный процент потерь по `push: fanout`. */
export function logPushFanout(scope: string, outcomes: PushOutcome[], extra: Record<string, unknown> = {}): void {
  logger.info("push: fanout", {
    scope,
    ...extra,
    total: outcomes.length,
    sent: outcomes.filter((o) => o === "sent").length,
    gone: outcomes.filter((o) => o === "gone").length,
    failed: outcomes.filter((o) => o === "failed").length,
  });
}

// Отправить push-уведомление участникам поездки. Автор мутации исключается
// (opts.exceptUserId): своё событие он уже видел тостом в приложении.
export async function sendPushToTripMembers(
  tripId: string,
  notification: { title: string; body: string; tag?: string; url?: string },
  opts?: { exceptUserId?: string | null }
) {
  try {
    // Проверяем что VAPID настроен
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return; // Push не настроен — silent skip
    }

    // Получаем участников поездки (кроме автора, если он указан)
    const members = await db.tripMember.findMany({
      where: {
        tripId,
        ...(opts?.exceptUserId ? { userId: { not: opts.exceptUserId } } : {}),
      },
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

    // deliverPush не бросает, поэтому allSettled не нужен
    const outcomes = await Promise.all(subscriptions.map((sub) => deliverPush(sub, payload)));

    // Удаляем невалидные подписки (410 Gone, 404 Not Found)
    const deadEndpoints = subscriptions
      .filter((_, i) => outcomes[i] === "gone")
      .map((sub) => sub.endpoint);
    if (deadEndpoints.length > 0) {
      await db.pushSubscription.deleteMany({ where: { endpoint: { in: deadEndpoints } } });
    }

    logPushFanout("trip", outcomes, { tripId, exceptUserId: opts?.exceptUserId ?? null });
  } catch (e) {
    logger.error("push: trip fanout crashed", {
      tripId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
