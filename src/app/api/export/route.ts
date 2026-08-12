import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";

// GET /api/export?tripId=... — экспорт данных поездки в JSON
// P0 #2: auth + membership (was open — anyone with tripId could export)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const [trip, days, places, photos, expenses, journals, messages, checklist, info, phrases, foods, budgetPlans] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId } }),
    db.day.findMany({ where: { tripId }, orderBy: { dayNumber: "asc" } }),
    db.place.findMany({ where: { tripId }, orderBy: { order: "asc" } }),
    db.photo.findMany({ where: { tripId } }),
    db.expense.findMany({ where: { tripId } }),
    db.journalEntry.findMany({ where: { tripId } }),
    db.boardMessage.findMany({ where: { tripId } }),
    db.checklistItem.findMany({ where: { tripId } }),
    db.infoItem.findMany({ where: { tripId } }),
    db.phrase.findMany({ where: { tripId } }),
    db.foodItem.findMany({ where: { tripId } }),
    db.budgetPlan.findMany({ where: { tripId } }),
  ]);

  return NextResponse.json({
    app: "TripTrek",
    trip,
    days,
    places,
    photos,
    expenses,
    journals,
    messages,
    checklist,
    info,
    phrases,
    foods,
    budgetPlans,
    exportedAt: new Date().toISOString(),
    version: "2.0",
  });
}
