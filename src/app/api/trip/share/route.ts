import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { requireTripEditor, requireTripOwner } from "@/lib/api-auth";
import { isShareExpired, parseExpiryDays, shareExpiryFromDays } from "@/lib/public-share";

// Публичная read-only страница поездки: /p/<shareToken>. Управляет только
// владелец (POST): включить/выключить ссылку, перегенерировать токен (rotate),
// разрешить ли гостям скачивать ZIP всех фото (shareAllowDownload) и до какого
// срока ссылка действует (expiresInDays: 1/7/30/90 суток от сейчас, null — бессрочно).
// Состояние (GET) читают все участники кроме зрителей — ссылку копируют
// и отправляют друзьям те, кто в поездке участвовал.
// Выключение или rotate мгновенно закрывает старую ссылку — страница ходит
// в БД по токену на каждый запрос, кэша с секретом нет.

function newShareToken(): string {
  return randomBytes(16).toString("hex");
}

const SHARE_SELECT = {
  shareEnabled: true,
  shareToken: true,
  shareAllowDownload: true,
  shareExpiresAt: true,
} as const;

function shareState(trip: {
  shareEnabled: boolean;
  shareToken: string | null;
  shareAllowDownload: boolean;
  shareExpiresAt: Date | null;
}) {
  return {
    enabled: trip.shareEnabled,
    token: trip.shareToken,
    allowDownload: trip.shareAllowDownload,
    expiresAt: trip.shareExpiresAt?.toISOString() ?? null,
    expired: isShareExpired(trip.shareExpiresAt),
  };
}

// GET /api/trip/share?tripId=... — состояние ссылки (участникам кроме зрителей)
export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("tripId") || "";
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { response } = await requireTripEditor(req, tripId);
  if (response) return response;

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: SHARE_SELECT,
  });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  return NextResponse.json(shareState(trip));
}

// POST /api/trip/share { tripId, enabled?, rotate?, allowDownload?, expiresInDays? } — владелец.
// enabled, allowDownload и срок независимы: можно менять тумблер скачивания,
// не трогая ссылку (и наоборот).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    tripId?: string;
    enabled?: boolean;
    rotate?: boolean;
    allowDownload?: boolean;
    expiresInDays?: number | null;
  };
  const tripId = body.tripId || "";
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { response } = await requireTripOwner(req, tripId);
  if (response) return response;

  const hasEnabled = typeof body.enabled === "boolean";
  const hasAllowDownload = typeof body.allowDownload === "boolean";
  const hasExpiry = "expiresInDays" in body;
  const expiryDays = hasExpiry ? parseExpiryDays(body.expiresInDays) : undefined;
  if (hasExpiry && expiryDays === undefined) {
    return NextResponse.json({ error: "expiresInDays: 1, 7, 30, 90 или null" }, { status: 400 });
  }
  if (!hasEnabled && !hasAllowDownload && !hasExpiry) {
    return NextResponse.json({ error: "enabled, allowDownload or expiresInDays required" }, { status: 400 });
  }

  const data: {
    shareEnabled?: boolean;
    shareToken?: string | null;
    shareAllowDownload?: boolean;
    shareExpiresAt?: Date | null;
  } = {};
  if (hasExpiry) data.shareExpiresAt = expiryDays === null ? null : shareExpiryFromDays(expiryDays!);
  if (hasEnabled) data.shareEnabled = body.enabled;
  if (hasAllowDownload) data.shareAllowDownload = body.allowDownload;
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
    select: SHARE_SELECT,
  });
  return NextResponse.json(shareState(trip));
}
