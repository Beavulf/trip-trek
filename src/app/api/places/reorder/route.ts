import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember } from "@/lib/api-auth";

// POST /api/places/reorder — порядок мест внутри дня (drag&drop в карточке дня).
// order — серверное поле: обычный PATCH места его не пишет (place-fields),
// перестановка идёт только здесь, полным списком id дня. Границы групп
// (утро/день/вечер) клиент не пересекает — порядок живёт внутри слота,
// финальный порядок дня = слоты по timeSortRank, внутри слота — этот order.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const tripId = typeof body.tripId === "string" ? body.tripId : "";
  const dayId = typeof body.dayId === "string" ? body.dayId : "";
  const placeIds = Array.isArray(body.placeIds) ? body.placeIds.filter((x) => typeof x === "string") : [];
  if (!tripId || !dayId || placeIds.length === 0) {
    return NextResponse.json({ error: "tripId, dayId, placeIds required" }, { status: 400 });
  }

  const day = await db.day.findFirst({ where: { id: dayId, tripId }, select: { id: true } });
  if (!day) return NextResponse.json({ error: "day не принадлежит этой поездке" }, { status: 400 });

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  // Список обязан покрывать все места дня ровно один раз — иначе после
  // перестановки остались бы места со «старым» order и день поехал бы вкривь
  const places = await db.place.findMany({ where: { dayId }, select: { id: true } });
  const have = new Set(places.map((p) => p.id));
  const uniq = new Set(placeIds);
  if (uniq.size !== placeIds.length || places.length !== placeIds.length || placeIds.some((id) => !have.has(id))) {
    return NextResponse.json({ error: "placeIds должен быть полной перестановкой мест дня" }, { status: 400 });
  }

  await db.$transaction(placeIds.map((id, order) => db.place.update({ where: { id, dayId }, data: { order } })));

  // place:updated без записи в NOTIFICATION_MAP — тихая инвалидация маршрута у участников
  publish(tripId, "place:updated", { dayId });
  return NextResponse.json({ ok: true, count: placeIds.length });
}
