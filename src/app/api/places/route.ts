import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/places — создать новое место (кастомное, вне плана)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, category, lat, lng, dayId, timeOfDay, budget, address, order } = body;
  if (!name || !dayId || typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "name, dayId, lat, lng required" }, { status: 400 });
  }
  // порядок — в конец дня
  const maxOrder = await db.place.aggregate({ where: { dayId }, _max: { order: true } });
  const nextOrder = order ?? (maxOrder._max.order ?? -1) + 1;

  const place = await db.place.create({
    data: {
      name,
      description: description || null,
      category: category || "sight",
      lat,
      lng,
      dayId,
      timeOfDay: timeOfDay || null,
      budget: budget ?? null,
      address: address || null,
      order: nextOrder,
      status: "planned",
    },
  });
  return NextResponse.json(place);
}
