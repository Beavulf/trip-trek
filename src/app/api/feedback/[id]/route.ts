import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { buildThread } from "@/lib/feedback-server";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/feedback/[id] — своё обращение с перепиской. Открытие помечает ответы прочитанными
// (userSeenAt): отдельный «seen»-запрос только множил бы гонки при быстром закрытии шита.
export async function GET(req: NextRequest, { params }: Ctx) {
  const { user, response } = await requireUser(req);
  if (response) return response;
  const { id } = await params;

  // Чужое обращение неотличимо от несуществующего — не подсказываем, какие id живы
  const row = await db.feedback.findFirst({
    where: { id, userId: user!.id },
    select: {
      id: true,
      type: true,
      message: true,
      screenshotUrl: true,
      status: true,
      createdAt: true,
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, author: true, body: true, createdAt: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "Обращение не найдено" }, { status: 404 });

  await db.feedback.update({ where: { id: row.id }, data: { userSeenAt: new Date() }, select: { id: true } });

  return NextResponse.json({
    id: row.id,
    type: row.type,
    status: row.status,
    screenshotUrl: row.screenshotUrl,
    createdAt: row.createdAt,
    thread: buildThread(row, row.messages),
  });
}
