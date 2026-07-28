import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";

// GET /api/trips/[id] — детали поездки
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await db.trip.findUnique({
    where: { id },
    include: {
      members: { include: { user: true } },
      _count: { select: { places: true, photos: true, expenses: true, journals: true, days: true } },
    },
  });
  if (!trip) return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  return NextResponse.json(trip);
}

// PATCH /api/trips/[id] — обновить поездку
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const trip = await db.trip.update({ where: { id }, data });
  emitWS("trip:updated", id, {});
  return NextResponse.json(trip);
}

// DELETE /api/trips/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.trip.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
