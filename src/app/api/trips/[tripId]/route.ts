import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember, requireTripOwner } from "@/lib/api-auth";

// GET /api/trips/[id] — детали поездки (только для участников).
// P0: раньше был без авторизации и отдавал user-записи участников вместе с хешами паролей.
const SAFE_USER_FIELDS = { id: true, name: true, emoji: true, color: true, avatarUrl: true, plan: true } as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    include: {
      members: { include: { user: { select: SAFE_USER_FIELDS } } },
      _count: { select: { places: true, photos: true, expenses: true, journals: true, days: true } },
    },
  });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  return NextResponse.json(trip);
}

// PATCH /api/trips/[id] — обновить поездку. Только владелец:
// название, даты, валюта и статус — настройки поездки, участник не должен их менять.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const { response } = await requireTripOwner(req, tripId);
  if (response) return response;
  const body = await req.json();
  const allowed = ["title", "destination", "startDate", "endDate", "totalDays", "totalBudget", "currency", "status", "coverColor", "coverEmoji"];
  const data: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) {
      if (k === "startDate" || k === "endDate") {
        data[k] = body[k] ? new Date(body[k]) : null;
      } else {
        data[k] = body[k];
      }
    }
  }
  const trip = await db.trip.update({ where: { id: tripId }, data });
  publish(tripId, "trip:updated", {});
  return NextResponse.json(trip);
}

// DELETE /api/trips/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  // Only the trip owner can delete the entire trip
  const { response } = await requireTripOwner(req, tripId);
  if (response) return response;
  await db.trip.delete({ where: { id: tripId } });
  return NextResponse.json({ ok: true });
}
