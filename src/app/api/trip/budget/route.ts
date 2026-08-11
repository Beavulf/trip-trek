import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";

// PATCH /api/trip/budget — обновить общий бюджет поездки
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { tripId, totalBudget } = body;
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;
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
