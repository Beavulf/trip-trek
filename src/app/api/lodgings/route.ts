import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember, requireTripEditor } from "@/lib/api-auth";
import { pickLodgingInput } from "@/lib/lodging";

// Проживание поездки (модель Lodging): заезд/выезд, бронь, телефон, цена.
// Поля и капы — через общий нормализатор lib/lodging (как place-fields для Place).

// Потолок записей на поездку: реальных проживаний единицы, лимит страхует от мусора
const MAX_PER_TRIP = 200;

// GET /api/lodgings?tripId=... — все проживания поездки по порядку заезда
export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const items = await db.lodging.findMany({
    take: MAX_PER_TRIP,
    where: { tripId },
    orderBy: [{ checkIn: "asc" }, { checkOut: "asc" }],
  });
  return NextResponse.json(items);
}

// POST /api/lodgings — добавить проживание (тело: tripId + поля)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const tripId = typeof body?.tripId === "string" ? body.tripId : "";
  const { user, response } = await requireTripEditor(req, tripId);
  if (response) return response;

  const parsed = pickLodgingInput(body, "create");
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { name, checkIn, checkOut, ...rest } = parsed.data;
  if (!name || !checkIn || !checkOut) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  if ((await db.lodging.count({ where: { tripId } })) >= MAX_PER_TRIP) {
    return NextResponse.json({ error: "Слишком много проживаний в поездке" }, { status: 400 });
  }

  const lodging = await db.lodging.create({ data: { ...rest, name, checkIn, checkOut, tripId } });
  publish(tripId, "lodging:added", { name: lodging.name, userName: user!.name }, user!.id);
  return NextResponse.json(lodging);
}

// PATCH /api/lodgings — изменить поля (тело: id + любые поля; null очищает необязательные)
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const existing = id
    ? await db.lodging.findUnique({ where: { id }, select: { tripId: true, checkIn: true, checkOut: true } })
    : null;
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { user, response } = await requireTripEditor(req, existing.tripId);
  if (response) return response;

  const parsed = pickLodgingInput(body, "patch");
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Меняется только одна из дат — проверяем порядок уже против сохранённой второй
  const nextIn = parsed.data.checkIn ?? existing.checkIn;
  const nextOut = parsed.data.checkOut ?? existing.checkOut;
  if (nextOut < nextIn) return NextResponse.json({ error: "Выезд не может быть раньше заезда" }, { status: 400 });

  const lodging = await db.lodging.update({ where: { id }, data: parsed.data });
  publish(existing.tripId, "lodging:updated", { lodgingId: id }, user!.id);
  return NextResponse.json(lodging);
}

// DELETE /api/lodgings?id=...
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const existing = await db.lodging.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { user, response } = await requireTripEditor(req, existing.tripId);
  if (response) return response;

  await db.lodging.delete({ where: { id } });
  publish(existing.tripId, "lodging:updated", { lodgingId: id }, user!.id);
  return NextResponse.json({ ok: true });
}
