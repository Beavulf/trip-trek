import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";

// POST /api/places — создать место
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, category, lat, lng, dayId, tripId, timeOfDay, budget, address, order, userName } = body;
  if (!name || !dayId || !tripId || typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "name, dayId, tripId, lat, lng required" }, { status: 400 });
  }
  const maxOrder = await db.place.aggregate({ where: { dayId }, _max: { order: true } });
  const nextOrder = order ?? (maxOrder._max.order ?? -1) + 1;

  const place = await db.place.create({
    data: { name, description: description || null, category: category || "sight", lat, lng, dayId, tripId, timeOfDay: timeOfDay || null, budget: budget ?? null, address: address || null, order: nextOrder, status: "planned" },
  });
  emitWS("place:created", tripId, { placeName: name, userName: userName || "Кто-то" });
  return NextResponse.json(place);
}
