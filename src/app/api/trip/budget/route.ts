import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/trip/budget — обновить общий бюджет поездки
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { tripId, totalBudget } = body;
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  if (typeof totalBudget !== "number" || totalBudget < 0) {
    return NextResponse.json({ error: "totalBudget must be a positive number" }, { status: 400 });
  }
  const trip = await db.trip.update({
    where: { id: tripId },
    data: { totalBudget },
  });
  return NextResponse.json(trip);
}
