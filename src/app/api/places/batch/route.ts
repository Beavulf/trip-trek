import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember } from "@/lib/api-auth";
import { pickPatchablePlace } from "@/lib/place-fields";
import { sanitizeUserText } from "@/lib/planner";

// POST /api/places/batch — создать несколько мест одним запросом
// (черновики планера/ресторанов/прогулки). Контракт полей — тот же
// pickPatchablePlace; WS-публикуем один раз, чтобы клиент не штормил инвалидациями.

const MAX_BATCH = 30;

interface Body {
  tripId?: string;
  userName?: string;
  places?: Record<string, unknown>[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const tripId = typeof body.tripId === "string" ? body.tripId : "";
    const { user, response } = await requireTripMember(req, tripId);
    if (response) return response;

    const input = Array.isArray(body.places) ? body.places.slice(0, MAX_BATCH) : [];
    if (input.length === 0) {
      return NextResponse.json({ error: "places required" }, { status: 400 });
    }

    // Все дни батча обязаны принадлежать поездке (как в POST /api/places)
    const days = await db.day.findMany({ where: { tripId }, select: { id: true } });
    const dayIds = new Set(days.map((d) => d.id));

    const rows: {
      tripId: string;
      name: string;
      category: string;
      lat: number;
      lng: number;
      dayId: string;
      timeOfDay: string | null;
      description: string | null;
      budget: number | null;
      address: string | null;
      status: string;
      order: number;
    }[] = [];

    for (const raw of input) {
      const p = pickPatchablePlace(raw);
      if (!p.name || !p.dayId || typeof p.lat !== "number" || typeof p.lng !== "number") continue;
      if (!dayIds.has(p.dayId)) continue;
      rows.push({
        tripId,
        name: sanitizeUserText(p.name, 200),
        category: p.category ?? "sight",
        lat: p.lat,
        lng: p.lng,
        dayId: p.dayId,
        timeOfDay: p.timeOfDay ?? null,
        // why-строка от ИИ — в description; адрес — только от геокодинга/OSM
        description: p.description ?? null,
        budget: p.budget ?? null,
        address: p.address ?? null,
        status: "planned",
        order: 0,
      });
    }
    if (rows.length === 0) {
      return NextResponse.json({ error: "Ни одно место не прошло валидацию (name, dayId, lat, lng)" }, { status: 400 });
    }

    // order внутри каждого дня: стартуем от максимума дня и наращиваем по порядку батча
    const dayOrders = new Map<string, number>();
    for (const dayId of new Set(rows.map((r) => r.dayId))) {
      const max = await db.place.aggregate({ where: { dayId }, _max: { order: true } });
      dayOrders.set(dayId, max._max.order ?? -1);
    }
    for (const r of rows) {
      const next = (dayOrders.get(r.dayId) ?? -1) + 1;
      dayOrders.set(r.dayId, next);
      r.order = next;
    }

    const created = await db.$transaction(rows.map((r) => db.place.create({ data: r })));
    publish(tripId, "place:created", {
      count: created.length,
      userName: sanitizeUserText(body.userName || user.name || "Кто-то", 60),
    });

    return NextResponse.json({ created: created.length, places: created });
  } catch (e) {
    console.error("[places/batch] failed:", e);
    return NextResponse.json({ error: "Не удалось добавить места" }, { status: 500 });
  }
}
