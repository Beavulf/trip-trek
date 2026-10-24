import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { hasUnreadReply } from "@/lib/feedback";

// GET /api/feedback/mine — свои обращения: статус, последняя реплика, «есть непрочитанный ответ».
// ?summary=1 — только число обращений с непрочитанным ответом (для точки у пункта меню).
export async function GET(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const rows = await db.feedback.findMany({
    where: { userId: user!.id },
    orderBy: { lastActivityAt: "desc" },
    take: 30,
    select: {
      id: true,
      type: true,
      message: true,
      screenshotUrl: true,
      status: true,
      userSeenAt: true,
      lastActivityAt: true,
      createdAt: true,
      // Для превью нужна только свежая реплика
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { author: true, body: true, createdAt: true } },
      _count: { select: { messages: true } },
    },
  });

  // Последняя реплика АДМИНА может быть не самой свежей (автор дописал после неё) — берём отдельно
  const adminLast = rows.length
    ? await db.feedbackMessage.groupBy({
        by: ["feedbackId"],
        where: { feedbackId: { in: rows.map((r) => r.id) }, author: "admin" },
        _max: { createdAt: true },
      })
    : [];
  const adminLastById = new Map(adminLast.map((g) => [g.feedbackId, g._max.createdAt]));

  const items = rows.map((r) => {
    const adminAt = adminLastById.get(r.id) ?? null;
    const last = r.messages[0];
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      screenshotUrl: r.screenshotUrl,
      createdAt: r.createdAt,
      lastActivityAt: r.lastActivityAt,
      messagesCount: r._count.messages + 1,
      unread: hasUnreadReply(adminAt, r.userSeenAt),
      // Превью: последняя реплика переписки или, если её ещё нет, само обращение
      preview: last ? { author: last.author, body: last.body.slice(0, 200) } : { author: "user", body: r.message.slice(0, 200) },
    };
  });

  const unread = items.filter((i) => i.unread).length;
  if (req.nextUrl.searchParams.get("summary") === "1") return NextResponse.json({ unread });
  return NextResponse.json({ items, unread });
}
