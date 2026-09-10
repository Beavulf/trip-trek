import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { remove as storageRemove } from "@/lib/storage";
import { userRateLimit } from "@/lib/rate-limit";

const STATUSES = ["new", "in_progress", "resolved"] as const;

const FEEDBACK_SELECT = {
  id: true,
  type: true,
  message: true,
  screenshotUrl: true,
  status: true,
  adminNote: true,
  pageUrl: true,
  tripId: true,
  userAgent: true,
  createdAt: true,
  resolvedAt: true,
  user: { select: { id: true, name: true, email: true, emoji: true, color: true } },
} as const;

// GET /api/admin/feedback?status=new|in_progress|resolved — очередь отзывов
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const statusParam = new URL(req.url).searchParams.get("status");
  const status = (STATUSES as readonly string[]).includes(statusParam || "") ? statusParam : undefined;

  const items = await db.feedback.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: FEEDBACK_SELECT,
  });

  return NextResponse.json(items);
}

// PATCH /api/admin/feedback — тело { id, status?, adminNote? }
// resolution-time ставится/снимается автоматически по статусу
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
    if (!(STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "status: new | in_progress | resolved" }, { status: 400 });
    }
    data.status = status;
    data.resolvedAt = status === "resolved" ? new Date() : null;
  }
  if (adminNote !== undefined) {
    data.adminNote = typeof adminNote === "string" ? adminNote.slice(0, 2000) || null : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  try {
    const updated = await db.feedback.update({ where: { id }, data, select: FEEDBACK_SELECT });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Отзыв не найден" }, { status: 404 });
    }
    console.error("[admin/feedback] PATCH failed:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}

// DELETE /api/admin/feedback?id= — удаляем запись и скриншот с диска
export async function DELETE(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-feedback", 60, 60_000);
  if (limited) return limited;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await db.feedback.findUnique({
    where: { id },
    select: { screenshotUrl: true },
  });
  if (!existing) return NextResponse.json({ error: "Отзыв не найден" }, { status: 404 });

  try {
    await db.feedback.delete({ where: { id } });
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
