import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripEditor } from "@/lib/api-auth";
import { MAX_LODGINGS_PER_TRIP, pickLodgingInput, type LodgingWrite } from "@/lib/lodging";

const MAX_STAYS = 60;
const MAX_PLACES_PER_STAY = 60;

const isIdList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.length <= MAX_PLACES_PER_STAY && v.every((x) => typeof x === "string" && x);

type ParsedStay = { placeIds: string[] } & ({ lodgingId: string } | { lodgingId: null; data: LodgingWrite });

// POST /api/lodgings/import — перенести отели из маршрута в «Жильё» (тело: tripId, stays).
// Одна операция: либо перенесено всё подтверждённое, либо ничего. Место привязывается к жилью,
// поэтому его сумма дальше считается в цене проживания, а не второй раз из маршрута.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const tripId = typeof body?.tripId === "string" ? body.tripId : "";
  const { user, response } = await requireTripEditor(req, tripId);
  if (response) return response;

  const stays: unknown = body?.stays;
  if (!Array.isArray(stays) || stays.length === 0 || stays.length > MAX_STAYS) {
    return NextResponse.json({ error: "Выберите, что перенести" }, { status: 400 });
  }

  const parsed: ParsedStay[] = [];
  for (const raw of stays as Record<string, unknown>[]) {
    if (!isIdList(raw?.placeIds)) return NextResponse.json({ error: "Не указаны места маршрута" }, { status: 400 });
    if (typeof raw.lodgingId === "string" && raw.lodgingId) {
      parsed.push({ placeIds: raw.placeIds, lodgingId: raw.lodgingId });
      continue;
    }
    const input = pickLodgingInput(raw, "create");
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
    parsed.push({ placeIds: raw.placeIds, lodgingId: null, data: input.data });
  }

  // Места и жильё проверяем на принадлежность поездке: id приходят от клиента
  const allIds = parsed.flatMap((s) => s.placeIds);
  if (new Set(allIds).size !== allIds.length) {
    return NextResponse.json({ error: "Одно место указано дважды" }, { status: 400 });
  }
  const places = await db.place.findMany({
    where: { id: { in: allIds }, tripId, category: "hotel", lodgingId: null },
    select: { id: true },
  });
  if (places.length !== allIds.length) {
    return NextResponse.json({ error: "Маршрут изменился, откройте перенос заново" }, { status: 409 });
  }
  const targetIds = parsed.flatMap((s) => (s.lodgingId ? [s.lodgingId] : []));
  if (targetIds.length > 0) {
    const found = await db.lodging.count({ where: { id: { in: [...new Set(targetIds)] }, tripId } });
    if (found !== new Set(targetIds).size) return NextResponse.json({ error: "Жильё не найдено" }, { status: 404 });
  }
  const toCreate = parsed.filter((s) => !s.lodgingId).length;
  if ((await db.lodging.count({ where: { tripId } })) + toCreate > MAX_LODGINGS_PER_TRIP) {
    return NextResponse.json({ error: "Слишком много проживаний в поездке" }, { status: 400 });
  }

  await db.$transaction(async (tx) => {
    for (const stay of parsed) {
      let lodgingId = stay.lodgingId;
      if (!lodgingId && "data" in stay) {
        const { name, checkIn, checkOut, ...rest } = stay.data;
        const created = await tx.lodging.create({ data: { ...rest, name: name!, checkIn: checkIn!, checkOut: checkOut!, tripId } });
        lodgingId = created.id;
      }
      await tx.place.updateMany({ where: { id: { in: stay.placeIds }, tripId }, data: { lodgingId } });
    }
  });

  // Один пуш на всю пачку: иначе друзьям прилетало бы по уведомлению на каждый отель
  if (toCreate > 0) publish(tripId, "lodging:added", { name: `из маршрута: ${toCreate}`, userName: user!.name }, user!.id);
  else publish(tripId, "lodging:updated", {}, user!.id);
  publish(tripId, "place:updated", {}, user!.id);
  return NextResponse.json({ ok: true, created: toCreate });
}
