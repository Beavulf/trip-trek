import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/export?tripId=... — экспорт данных поездки в JSON
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

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
