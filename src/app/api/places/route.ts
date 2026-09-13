import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember } from "@/lib/api-auth";

// POST /api/places — создать место
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, category, lat, lng, dayId, tripId, timeOfDay, budget, address, order, userName } = body;
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;
  if (!name || !dayId || !tripId || typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "name, dayId, tripId, lat, lng required" }, { status: 400 });
  }

  // dayId обязан принадлежать этой поездке (аудит 2026-09-12; как в journal)
  const day = await db.day.findFirst({ where: { id: dayId, tripId }, select: { id: true } });
  if (!day) {
    return NextResponse.json({ error: "day не принадлежит этой поездке" }, { status: 400 });
  }

  const maxOrder = await db.place.aggregate({ where: { dayId }, _max: { order: true } });
  const nextOrder = order ?? (maxOrder._max.order ?? -1) + 1;

  const place = await db.place.create({
      data: { name: String(name).slice(0, 200), description: description ? String(description).slice(0, 2000) : null, category: (category || "sight").slice(0, 50), lat, lng, dayId, tripId, timeOfDay: timeOfDay ? String(timeOfDay).slice(0, 20) : null, budget: budget ?? null, address: address ? String(address).slice(0, 300) : null, order: nextOrder, status: "planned" },
  });
  publish(tripId, "place:created", { placeName: name, userName: userName || "Кто-то" });
  return NextResponse.json(place);
}
