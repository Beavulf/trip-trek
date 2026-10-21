import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { requireTripOwner } from "@/lib/api-auth";

// Публичная read-only ссылка на поездку для родных: /p/<token>.
// Управляет только владелец: включить/выключить/перегенерировать токен.
// Выключение или rotate мгновенно закрывает старую ссылку — страница ходит
// в БД по токену на каждый запрос, кэша с секретом нет.

function newShareToken(): string {
  return randomBytes(16).toString("hex");
}

// GET /api/trip/share?tripId=... — состояние ссылки (владельцу)
export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("tripId") || "";
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { response } = await requireTripOwner(req, tripId);
  if (response) return response;

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { shareEnabled: true, shareToken: true },
  });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  return NextResponse.json({ enabled: trip.shareEnabled, token: trip.shareToken });
}

// POST /api/trip/share { tripId, enabled, rotate? } — владелец
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    tripId?: string;
    enabled?: boolean;
    rotate?: boolean;
  };
  const tripId = body.tripId || "";
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { response } = await requireTripOwner(req, tripId);
  if (response) return response;

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
  }

  const data: { shareEnabled: boolean; shareToken?: string | null } = { shareEnabled: body.enabled };
  if (body.enabled) {
    // Включение: переиспользуем существующий токен, rotate — только свежий.
    // Токен живёт пока выключен (вернул ссылку — тот же адрес), rotate отзывает.
    const existing = await db.trip.findUnique({
      where: { id: tripId },
      select: { shareToken: true },
    });
    if (body.rotate || !existing?.shareToken) data.shareToken = newShareToken();
  }

  const trip = await db.trip.update({
    where: { id: tripId },
    data,
    select: { shareEnabled: true, shareToken: true },
  });
  return NextResponse.json({ enabled: trip.shareEnabled, token: trip.shareToken });
}
