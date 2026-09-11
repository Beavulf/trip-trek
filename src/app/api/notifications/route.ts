import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";

// GET /api/notifications — свои уведомления (свежие сверху) + счётчик непрочитанных
export async function GET(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const [items, unread] = await Promise.all([
    db.userNotification.findMany({
      where: { userId: user!.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.userNotification.count({ where: { userId: user!.id, readAt: null } }),
  ]);

  return NextResponse.json({ items, unread });
}

// POST /api/notifications — отметить прочитанными: { ids: [...] } или { all: true }
export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const { ids, all } = body as { ids?: string[]; all?: boolean };

  if (all === true) {
    await db.userNotification.updateMany({
      where: { userId: user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (Array.isArray(ids) && ids.length > 0) {
    await db.userNotification.updateMany({
      where: { userId: user!.id, id: { in: ids.slice(0, 100) } },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
