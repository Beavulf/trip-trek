import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notify";
import { FEEDBACK_TYPE_META, type FeedbackType } from "@/lib/feedback";

// Серверные помощники обратной связи: уведомления админам и сборка ответов API.
// Чистые правила (статусы, разбор входа) — в `feedback.ts`, здесь только то, что ходит в БД.

/** Ссылка из уведомления админу: штаб сам открывает нужное обращение. */
export function adminFeedbackUrl(id: string): string {
  return `/admin/feedback?open=${encodeURIComponent(id)}`;
}

/** Ссылка из уведомления автору: приложение само открывает его обращение. */
export function userFeedbackUrl(id: string): string {
  return `/?feedback=${encodeURIComponent(id)}`;
}

function preview(text: string, max = 140): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/**
 * Сообщить всем админам о новом обращении или реплике автора: колокольчик + web-push.
 * Никогда не бросает — сбой уведомления не должен ронять отправку обращения.
 */
export async function notifyAdminsOfFeedback(opts: {
  feedbackId: string;
  type: FeedbackType;
  authorName: string;
  /** Автор-админ сам себя не уведомляет */
  authorId?: string | null;
  text: string;
  kind: "new" | "reply";
}): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: "admin", ...(opts.authorId ? { id: { not: opts.authorId } } : {}) },
      select: { id: true },
    });
    const meta = FEEDBACK_TYPE_META[opts.type];
    const title =
      opts.kind === "new"
        ? `${meta.emoji} Новое обращение: ${meta.label.toLowerCase()} от ${opts.authorName}`
        : `↩️ ${opts.authorName} ответил(а) в обращении`;
    await Promise.allSettled(
      admins.map((a) =>
        notifyUser(a.id, {
          type: "feedback_new",
          title,
          body: preview(opts.text),
          url: adminFeedbackUrl(opts.feedbackId),
        })
      )
    );
  } catch (e) {
    console.error("[feedback] admin notify failed:", e);
  }
}

export interface FeedbackMessageDto {
  id: string;
  author: "user" | "admin";
  body: string;
  createdAt: string;
}

/**
 * Переписка обращения: первое сообщение автора + реплики по времени.
 * Первое сообщение живёт в Feedback.message, поэтому оно подставляется виртуальной репликой.
 */
export function buildThread(
  feedback: { id: string; message: string; createdAt: Date },
  messages: { id: string; author: string; body: string; createdAt: Date }[]
): FeedbackMessageDto[] {
  return [
    { id: `${feedback.id}:first`, author: "user", body: feedback.message, createdAt: feedback.createdAt.toISOString() },
    ...messages.map((m) => ({
      id: m.id,
      author: (m.author === "admin" ? "admin" : "user") as "user" | "admin",
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  ];
}
