import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { userRateLimit } from "@/lib/rate-limit";
import {
  MAX_REPLY,
  MAX_THREAD_MESSAGES,
  parseFeedbackType,
  parseMessageText,
  statusAfterMessage,
  type FeedbackStatus,
} from "@/lib/feedback";
import { notifyAdminsOfFeedback } from "@/lib/feedback-server";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/feedback/[id]/messages — автор дописывает в своё обращение: { body }.
// Закрытое обращение возвращается в очередь админа (statusAfterMessage).
export async function POST(req: NextRequest, { params }: Ctx) {
  const { user, response } = await requireUser(req);
  if (response) return response;
  const limited = userRateLimit(req, user!.id, "feedback-reply", 20, 60 * 60_000);
  if (limited) return limited;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { body?: unknown };
  const text = parseMessageText(body.body, MAX_REPLY);
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });

  const row = await db.feedback.findFirst({
    where: { id, userId: user!.id },
    select: { id: true, type: true, status: true, _count: { select: { messages: true } } },
  });
  if (!row) return NextResponse.json({ error: "Обращение не найдено" }, { status: 404 });
  if (row._count.messages >= MAX_THREAD_MESSAGES) {
    return NextResponse.json({ error: "В переписке слишком много сообщений — создайте новое обращение" }, { status: 409 });
  }

  const status = statusAfterMessage("user", row.status as FeedbackStatus);
  const [message] = await db.$transaction([
    db.feedbackMessage.create({
      data: { feedbackId: row.id, author: "user", authorId: user!.id, body: text.message },
      select: { id: true, author: true, body: true, createdAt: true },
    }),
    db.feedback.update({
      where: { id: row.id },
      data: {
        status,
        // повторно открытое обращение больше не «решено»
        resolvedAt: status === "resolved" ? undefined : null,
        lastActivityAt: new Date(),
        userSeenAt: new Date(),
      },
      select: { id: true },
    }),
  ]);

  void notifyAdminsOfFeedback({
    feedbackId: row.id,
    type: parseFeedbackType(row.type),
    authorName: user!.name || "Пользователь",
    authorId: user!.id,
    text: text.message,
    kind: "reply",
  });

  return NextResponse.json({ ok: true, status, message: { ...message, createdAt: message.createdAt.toISOString() } });
}
