import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripEditor } from "@/lib/api-auth";

// PATCH /api/trip/budget — обновить общий бюджет поездки
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { tripId, totalBudget } = body ?? {};
  if (typeof tripId !== "string" || !tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { response } = await requireTripEditor(req, tripId);
  if (response) return response;
  if (typeof totalBudget !== "number" || !Number.isFinite(totalBudget) || totalBudget < 0 || totalBudget > 1_000_000_000) {
    return NextResponse.json({ error: "totalBudget must be a non-negative number" }, { status: 400 });
  }
  const trip = await db.trip.update({
    where: { id: tripId },
    data: { totalBudget },
  });
  // Уведомляем других клиентов через WS что бюджет обновился
  await publish(tripId, "trip:updated", {});
  return NextResponse.json(trip);
}
