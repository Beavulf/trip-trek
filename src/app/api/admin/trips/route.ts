import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { userRateLimit } from "@/lib/rate-limit";

// GET /api/admin/trips?q= — все поездки с цифрами (поиск по названию/назначению)
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const q = new URL(req.url).searchParams.get("q")?.trim();
  const trips = await db.trip.findMany({
    where: q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { destination: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      destination: true,
      coverColor: true,
      coverEmoji: true,
      status: true,
      startDate: true,
      totalDays: true,
      currency: true,
      inviteCode: true,
      createdAt: true,
      updatedAt: true,
      totalBudget: true,
      _count: { select: { members: true, places: true, photos: true, expenses: true, journals: true } },
    },
  });

  return NextResponse.json(trips);
}

// DELETE /api/admin/trips?id= — принудительное удаление поездки.
// Каскад по схеме сносит дни, места, фото, траты и т.д. (то же, что удаляет
// владелец через /api/trips/[tripId], только без проверки владельца).
export async function DELETE(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;
  const limited = userRateLimit(req, admin!.id, "admin-trips", 60, 60_000);
  if (limited) return limited;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await db.trip.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });
    }
    console.error("[admin/trips] DELETE failed:", e);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
