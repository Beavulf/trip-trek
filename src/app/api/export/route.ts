import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/export — экспорт всех данных поездки в JSON
export async function GET() {
  const [settings, participants, days, places, photos, expenses, journals, checklist, info, phrases, foods] = await Promise.all([
    db.tripSettings.findUnique({ where: { id: "default" } }),
    db.participant.findMany(),
    db.day.findMany({ orderBy: { dayNumber: "asc" } }),
    db.place.findMany(),
    db.photo.findMany(),
    db.expense.findMany(),
    db.journalEntry.findMany(),
    db.checklistItem.findMany(),
    db.infoItem.findMany(),
    db.phrase.findMany(),
    db.foodItem.findMany(),
  ]);

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "TripTrek China",
    settings,
    participants,
    days,
    places,
    photos: photos.map((p) => ({ ...p, url: p.url })), // URL остаётся, файлы в /uploads
    expenses,
    journals,
    checklist,
    info,
    phrases,
    foods,
  };

  return NextResponse.json(data, {
    headers: {
      "Content-Disposition": `attachment; filename="triptrek-china-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
