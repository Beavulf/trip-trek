import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { buildThread } from "@/lib/feedback-server";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/feedback/[id] — обращение целиком: переписка, контекст устройства, автор.
export async function GET(req: NextRequest, { params }: Ctx) {
  const { response } = await requireAdmin(req);
  if (response) return response;
  const { id } = await params;

  const row = await db.feedback.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      message: true,
      screenshotUrl: true,
      adminNote: true,
      screen: true,
      pageUrl: true,
      tripId: true,
      userAgent: true,
      viewport: true,
      appVersion: true,
      contactEmail: true,
      createdAt: true,
      lastActivityAt: true,
      resolvedAt: true,
      user: { select: { id: true, name: true, email: true, emoji: true, color: true, plan: true, createdAt: true } },
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, author: true, body: true, createdAt: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "Отзыв не найден" }, { status: 404 });

  // Сколько всего обращений у автора: «пишет в пятый раз» меняет приоритет
  const authorTotal = row.user ? await db.feedback.count({ where: { userId: row.user.id } }) : 0;
  // Название поездки вместо голого id (поездку могли удалить — тогда null)
  const trip = row.tripId ? await db.trip.findUnique({ where: { id: row.tripId }, select: { id: true, title: true } }) : null;

  const { messages, ...rest } = row;
  return NextResponse.json({ ...rest, trip, authorTotal, thread: buildThread(row, messages) });
}
