import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember } from "@/lib/api-auth";
import { pickPatchablePlace } from "@/lib/place-fields";

// POST /api/places — создать место. Поля и капы — через общий контракт place-fields.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const input = pickPatchablePlace(body);
  const tripId = typeof body.tripId === "string" ? body.tripId : "";
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;
  if (!input.name || !input.dayId || !tripId || typeof input.lat !== "number" || typeof input.lng !== "number") {
    return NextResponse.json({ error: "name, dayId, tripId, lat, lng required" }, { status: 400 });
  }

  // dayId обязан принадлежать этой поездке (аудит 2026-09-12; как в journal)
  const day = await db.day.findFirst({ where: { id: input.dayId, tripId }, select: { id: true } });
  if (!day) {
    return NextResponse.json({ error: "day не принадлежит этой поездке" }, { status: 400 });
  }

  // order — серверное поле; явное число из тела разрешено только здесь (создание)
  const maxOrder = await db.place.aggregate({ where: { dayId: input.dayId }, _max: { order: true } });
  const order =
    typeof body.order === "number" && Number.isFinite(body.order)
      ? body.order
      : (maxOrder._max.order ?? -1) + 1;

  const place = await db.place.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? "sight",
      lat: input.lat,
      lng: input.lng,
      dayId: input.dayId,
      tripId,
      timeOfDay: input.timeOfDay ?? null,
      budget: input.budget ?? null,
      address: input.address ?? null,
      order,
      status: "planned",
    },
  });
  publish(tripId, "place:created", { placeName: place.name, userName: body.userName || "Кто-то" });
  return NextResponse.json(place);
}
