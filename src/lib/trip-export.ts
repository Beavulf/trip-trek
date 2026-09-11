import { db } from "@/lib/db";

// Сборка полного JSON-бэкапа поездки (формат v2.0, совместим с /api/trip/import).
// Используется и пользовательским /api/export, и админским экспортом из панели.

export async function buildTripExport(tripId: string) {
  const [trip, days, places, photos, expenses, journals, messages, checklist, info, phrases, foods, budgetPlans] =
    await Promise.all([
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

  if (!trip) return null;

  return {
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
  };
}
