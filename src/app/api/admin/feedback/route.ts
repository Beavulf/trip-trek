import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";
import { notifyUser } from "@/lib/notify";
import { remove as storageRemove } from "@/lib/storage";
import { userRateLimit } from "@/lib/rate-limit";
import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from "@/lib/feedback";
import { userFeedbackUrl } from "@/lib/feedback-server";

const PAGE_SIZE = 30;

// GET /api/admin/feedback?status=&type=&q=&cursor= — очередь обращений по свежести активности.
// Фильтры независимы; q ищет по тексту (в т.ч. по переписке), имени, email и контакту гостя.
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const params = new URL(req.url).searchParams;
  const statusParam = params.get("status") || "";
  const typeParam = params.get("type") || "";
  const q = (params.get("q") || "").trim().slice(0, 100);
  const cursor = params.get("cursor") || undefined;

  const and: Prisma.FeedbackWhereInput[] = [];
  if ((FEEDBACK_STATUSES as readonly string[]).includes(statusParam)) and.push({ status: statusParam });
  if ((FEEDBACK_TYPES as readonly string[]).includes(typeParam)) and.push({ type: typeParam });
  if (q) {
    const has = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { message: has },
        { contactEmail: has },
        { user: { is: { OR: [{ name: has }, { email: has }] } } },
        { messages: { some: { body: has } } },
      ],
    });
  }

  const rows = await db.feedback.findMany({
    where: and.length ? { AND: and } : undefined,
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      type: true,
      status: true,
      message: true,
      screenshotUrl: true,
      contactEmail: true,
      lastActivityAt: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, emoji: true, color: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { author: true, body: true } },
      _count: { select: { messages: true } },
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const items = page.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    message: r.message.slice(0, 300),
    hasScreenshot: !!r.screenshotUrl,
    contactEmail: r.contactEmail,
    user: r.user,
    lastActivityAt: r.lastActivityAt,
    createdAt: r.createdAt,
    messagesCount: r._count.messages + 1,
    // Чья реплика последняя: если не админа — мяч на нашей стороне
    lastMessage: r.messages[0]
      ? { author: r.messages[0].author, body: r.messages[0].body.slice(0, 200) }
      : { author: "user", body: r.message.slice(0, 200) },
  }));

  return NextResponse.json({ items, nextCursor: hasMore ? page[page.length - 1].id : null });
}

// PATCH /api/admin/feedback — тело { id, status?, adminNote? }
// Ответ пользователю — отдельный роут (`[id]/messages`): это уже реплика переписки.
export async function PATCH(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-feedback", 60, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { id, status, adminNote } = body as { id?: string; status?: string; adminNote?: string | null };

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: { status?: string; adminNote?: string | null; resolvedAt?: Date | null } = {};
  if (status !== undefined) {
    if (!(FEEDBACK_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "status: new | in_progress | resolved" }, { status: 400 });
    }
    data.status = status;
    data.resolvedAt = status === "resolved" ? new Date() : null;
  }
  if (adminNote !== undefined) {
    data.adminNote = typeof adminNote === "string" ? adminNote.trim().slice(0, 2000) || null : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  try {
    const before = await db.feedback.findUnique({ where: { id }, select: { status: true } });
    if (!before) return NextResponse.json({ error: "Отзыв не найден" }, { status: 404 });

    const updated = await db.feedback.update({
      where: { id },
      data,
      select: { id: true, status: true, adminNote: true, resolvedAt: true, userId: true, user: { select: { name: true } } },
    });
    const label = updated.user?.name || "гость";
    if (data.status && data.status !== before.status) {
      await logAdmin(admin!.id, "feedback.status", { type: "feedback", id, label }, { status: data.status });
      // Закрыли без ответа текстом — автору всё равно стоит знать, что обращение рассмотрено
      if (data.status === "resolved" && updated.userId) {
        await notifyUser(updated.userId, {
          type: "feedback_reply",
          title: "Ваше обращение закрыто",
          body: "Если вопрос остался — напишите в обращении, и мы вернёмся к нему.",
          url: userFeedbackUrl(id),
        });
      }
    }
    if (adminNote !== undefined) {
      await logAdmin(admin!.id, "feedback.note", { type: "feedback", id, label });
    }
    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      adminNote: updated.adminNote,
      resolvedAt: updated.resolvedAt,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Отзыв не найден" }, { status: 404 });
    }
    console.error("[admin/feedback] PATCH failed:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}

// DELETE /api/admin/feedback?id= — удаляем обращение с перепиской и скриншот с диска
export async function DELETE(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-feedback", 60, 60_000);
  if (limited) return limited;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await db.feedback.findUnique({
    where: { id },
    select: { screenshotUrl: true, type: true, user: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Отзыв не найден" }, { status: 404 });

  try {
    await db.feedback.delete({ where: { id } });
    await logAdmin(admin!.id, "feedback.delete", { type: "feedback", id, label: existing.user?.name || "гость" }, { type: existing.type });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Отзыв не найден" }, { status: 404 });
    }
    console.error("[admin/feedback] DELETE failed:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }

  // Файл чистим после успешного удаления записи; отсутствующий — не ошибка
  if (existing.screenshotUrl) {
    try {
      await storageRemove(existing.screenshotUrl);
    } catch {
      // не критично
    }
  }

  return NextResponse.json({ ok: true });
}
