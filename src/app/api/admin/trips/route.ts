import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";
import { userRateLimit } from "@/lib/rate-limit";
import { buildTripExport } from "@/lib/trip-export";

const TRIP_STATUSES = ["planning", "active", "completed"];

// GET /api/admin/trips?q=&status= — список всех поездок
// GET /api/admin/trips?id= — карточка: поездка + состав + счётчики
// GET /api/admin/trips?export=<id> — полный JSON-бэкап поездки (как /api/export)
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const params = new URL(req.url).searchParams;
  const exportId = params.get("export");
  if (exportId) {
    const payload = await buildTripExport(exportId);
    if (!payload) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });
    return NextResponse.json(payload);
  }

  const id = params.get("id");
  if (id) {
    const trip = await db.trip.findUnique({
      where: { id },
      include: {
        members: {
          select: {
            id: true,
            role: true,
            displayName: true,
            emoji: true,
            color: true,
            budget: true,
            joinedAt: true,
            user: { select: { id: true, name: true, email: true, emoji: true, color: true, avatarUrl: true, plan: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
        _count: { select: { members: true, days: true, places: true, photos: true, expenses: true, journals: true, messages: true } },
      },
    });
    if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });
    return NextResponse.json(trip);
  }

  const q = params.get("q")?.trim();
  const status = params.get("status")?.trim();
  const where: Prisma.TripWhereInput = {
    AND: [
      q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { destination: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      status && TRIP_STATUSES.includes(status) ? { status } : {},
    ],
  };
  const trips = await db.trip.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      _count: { select: { members: true, places: true, photos: true, expenses: true, journals: true } },
    },
  });

  return NextResponse.json(trips);
}

// PATCH /api/admin/trips — тело { id, title?, destination?, status?, totalBudget?, currency?, regenInvite? }
export async function PATCH(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-trips", 60, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { id, title, destination, status, totalBudget, currency, regenInvite } = body as {
    id?: string;
    title?: string;
    destination?: string;
    status?: string;
    totalBudget?: number;
    currency?: string;
    regenInvite?: boolean;
  };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Prisma.TripUpdateInput = {};
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
      return NextResponse.json({ error: "Название: 1–120 символов" }, { status: 400 });
    }
    data.title = title.trim();
  }
  if (destination !== undefined) {
    if (typeof destination !== "string" || !destination.trim() || destination.trim().length > 120) {
      return NextResponse.json({ error: "Направление: 1–120 символов" }, { status: 400 });
    }
    data.destination = destination.trim();
  }
  if (status !== undefined) {
    if (typeof status !== "string" || !TRIP_STATUSES.includes(status)) {
      return NextResponse.json({ error: "status: planning | active | completed" }, { status: 400 });
    }
    data.status = status;
  }
  if (totalBudget !== undefined) {
    if (typeof totalBudget !== "number" || !Number.isFinite(totalBudget) || totalBudget < 0 || totalBudget > 1e9) {
      return NextResponse.json({ error: "Бюджет: число ≥ 0" }, { status: 400 });
    }
    data.totalBudget = totalBudget;
  }
  if (currency !== undefined) {
    if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency.trim())) {
      return NextResponse.json({ error: "Валюта — 3 буквы (USD, CNY…)" }, { status: 400 });
    }
    data.currency = currency.trim().toUpperCase();
  }
  if (regenInvite === true) {
    data.inviteCode = crypto.randomUUID();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  try {
    const before = await db.trip.findUnique({ where: { id }, select: { title: true } });
    const updated = await db.trip.update({
      where: { id },
      data,
      include: {
        _count: { select: { members: true, places: true, photos: true, expenses: true, journals: true } },
      },
    });

    if (regenInvite) {
      await logAdmin(admin!.id, "trip.invite_regen", { type: "trip", id, label: updated.title });
    }
    const tripFields = Object.keys(data).filter((k) => k !== "inviteCode");
    if (tripFields.length > 0) {
      await logAdmin(admin!.id, "trip.edit", { type: "trip", id, label: updated.title }, {
        fields: tripFields,
        beforeTitle: before?.title,
      });
    }

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });
      if (e.code === "P2002") return NextResponse.json({ error: "Не удалось сгенерировать уникальный код, попробуй ещё раз" }, { status: 409 });
    }
    console.error("[admin/trips] PATCH failed:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}

// DELETE /api/admin/trips?id= — удаление поездки со всем содержимым (каскад схемы)
export async function DELETE(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-trips", 60, 60_000);
  if (limited) return limited;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const trip = await db.trip.findUnique({ where: { id }, select: { title: true, _count: { select: { members: true, photos: true } } } });
  if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });

  try {
    await db.trip.delete({ where: { id } });
    await logAdmin(admin!.id, "trip.delete", { type: "trip", id, label: trip.title }, {
      members: trip._count.members,
      photos: trip._count.photos,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });
    }
    console.error("[admin/trips] DELETE failed:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
