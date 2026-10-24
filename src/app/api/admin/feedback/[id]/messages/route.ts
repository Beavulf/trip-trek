import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";
import { notifyUser } from "@/lib/notify";
import { userRateLimit } from "@/lib/rate-limit";
import { isMailConfigured, sendMail } from "@/lib/mail/mailer";
import { feedbackReplyEmail } from "@/lib/mail/templates";
import {
  FEEDBACK_STATUSES,
  MAX_REPLY,
  MAX_THREAD_MESSAGES,
  parseMessageText,
  statusAfterMessage,
  type FeedbackStatus,
} from "@/lib/feedback";
import { userFeedbackUrl } from "@/lib/feedback-server";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/feedback/[id]/messages — ответ админа: { body, status? }.
// Без status «новое» уходит «в работу» (statusAfterMessage); status: "resolved" — ответить и закрыть одним действием.
// Автору с аккаунтом ответ приходит в колокольчик и пушем, гостю — письмом на оставленный адрес.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-feedback", 60, 60_000);
  if (limited) return limited;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { body?: unknown; status?: unknown };
  const text = parseMessageText(body.body, MAX_REPLY);
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });
  if (body.status !== undefined && !(FEEDBACK_STATUSES as readonly string[]).includes(String(body.status))) {
    return NextResponse.json({ error: "status: new | in_progress | resolved" }, { status: 400 });
  }

  const row = await db.feedback.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      message: true,
      userId: true,
      contactEmail: true,
      user: { select: { name: true } },
      _count: { select: { messages: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "Отзыв не найден" }, { status: 404 });
  if (row._count.messages >= MAX_THREAD_MESSAGES) {
    return NextResponse.json({ error: "В переписке слишком много сообщений" }, { status: 409 });
  }

  const status = (body.status as FeedbackStatus | undefined) ?? statusAfterMessage("admin", row.status as FeedbackStatus);
  const now = new Date();
  const [message] = await db.$transaction([
    db.feedbackMessage.create({
      data: { feedbackId: row.id, author: "admin", authorId: admin!.id, body: text.message },
      select: { id: true, author: true, body: true, createdAt: true },
    }),
    db.feedback.update({
      where: { id: row.id },
      data: { status, resolvedAt: status === "resolved" ? now : null, lastActivityAt: now },
      select: { id: true },
    }),
  ]);

  const label = row.user?.name || "гость";
  await logAdmin(admin!.id, "feedback.reply", { type: "feedback", id: row.id, label }, { status });
  if (status !== row.status) {
    await logAdmin(admin!.id, "feedback.status", { type: "feedback", id: row.id, label }, { status });
  }

  // Доставка: аккаунт — в приложение, гость — на почту. Сбой доставки ответ не отменяет
  let emailed: boolean | null = null;
  if (row.userId) {
    await notifyUser(row.userId, {
      type: "feedback_reply",
      title: status === "resolved" ? "Ответ на обращение — вопрос закрыт" : "Ответ на ваше обращение",
      body: text.message.slice(0, 300),
      url: userFeedbackUrl(row.id),
    });
  } else if (row.contactEmail) {
    emailed = isMailConfigured();
    if (emailed) {
      const mail = feedbackReplyEmail(text.message, row.message);
      void sendMail({ to: row.contactEmail, subject: mail.subject, html: mail.html });
    }
  }

  return NextResponse.json({
    ok: true,
    status,
    emailed,
    message: { ...message, createdAt: message.createdAt.toISOString() },
  });
}
