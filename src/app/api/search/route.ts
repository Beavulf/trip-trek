import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { currencySymbol } from "@/lib/currencies";

// GET /api/search?q=…&tripId=… — поиск только внутри поездки участника.
// Фильтрация в JS: SQLite LIKE регистронезависим только для ASCII,
// для кириллицы/иероглифов сравниваем нижние регистры на стороне приложения.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const tripId = searchParams.get("tripId");

  if (!q || q.length < 2) return NextResponse.json({ results: [] });
  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { currency: true } });
  const sym = currencySymbol(trip?.currency);

  // каждое слово запроса должно встретиться хотя бы в одном из полей
  const words = q.split(/\s+/).filter(Boolean);
  const matches = (fields: (string | null | undefined)[]) => {
    const hay = fields.filter(Boolean).map((f) => f!.toLowerCase());
    return words.every((w) => hay.some((f) => f.includes(w)));
  };

  const results: Array<{
    id: string;
    type: "city" | "place" | "phrase" | "food" | "expense" | "journal";
    title: string;
    subtitle: string;
    meta?: string;
    icon: string;
    dayNumber?: number | null;
    cityKey?: string | null;
  }> = [];

  const [days, places, phrases, foods, expenses, journals] = await Promise.all([
    db.day.findMany({ where: { tripId }, orderBy: { dayNumber: "asc" } }),
    db.place.findMany({ where: { tripId } }),
    db.phrase.findMany({ where: { tripId } }),
    db.foodItem.findMany({ where: { tripId } }),
    db.expense.findMany({ where: { tripId } }),
    db.journalEntry.findMany({ where: { tripId } }),
  ]);

  const dayById = new Map(days.map((d) => [d.id, d]));

  // Города из дней маршрута — ведут на карту с фильтром по городу
  const seenCities = new Set<string>();
  for (const d of days) {
    if (!d.city || seenCities.has(d.city)) continue;
    if (matches([d.city, d.title])) {
      seenCities.add(d.city);
      results.push({
        id: `city-${d.cityKey || d.city}`,
        type: "city",
        title: d.city,
        subtitle: `День ${d.dayNumber}${d.title ? ` · ${d.title}` : ""}`,
        meta: "Город",
        icon: "🏙️",
        dayNumber: d.dayNumber,
        cityKey: d.cityKey,
      });
    }
  }

  for (const p of places) {
    const day = dayById.get(p.dayId);
    if (!matches([p.name, p.description, p.address, p.notes])) continue;
    results.push({
      id: `place-${p.id}`,
      type: "place",
      title: p.name,
      subtitle: p.description?.slice(0, 80) || p.address || "",
      meta: `${day?.city ?? ""} · День ${day?.dayNumber ?? ""}`,
      icon: "📍",
      dayNumber: day?.dayNumber ?? null,
    });
  }

  for (const p of phrases) {
    if (!matches([p.ru, p.cn, p.pinyin])) continue;
    results.push({
      id: `phrase-${p.id}`,
      type: "phrase",
      title: p.ru,
      subtitle: `${p.cn} · ${p.pinyin}`,
      meta: "Фраза",
      icon: "💬",
    });
  }

  for (const f of foods) {
    if (!matches([f.name, f.nameCn, f.description, f.place])) continue;
    results.push({
      id: `food-${f.id}`,
      type: "food",
      title: f.name,
      subtitle: f.description.slice(0, 80),
      meta: `${f.emoji || "🍽️"} ${f.price || ""}`,
      icon: f.emoji || "🍽️",
    });
  }

  for (const e of expenses) {
    if (!matches([e.description, e.category])) continue;
    results.push({
      id: `expense-${e.id}`,
      type: "expense",
      title: e.description,
      subtitle: `${sym}${e.amount} · ${e.category}`,
      meta: "Трата",
      icon: "💸",
    });
  }

  for (const j of journals) {
    if (!matches([j.content, j.mood])) continue;
    const day = dayById.get(j.dayId);
    results.push({
      id: `journal-${j.id}`,
      type: "journal",
      title: j.content.slice(0, 60) + (j.content.length > 60 ? "…" : ""),
      subtitle: j.mood || "",
      meta: `Дневник · ${day?.city ?? ""}`,
      icon: "📔",
      dayNumber: day?.dayNumber ?? null,
    });
  }

  return NextResponse.json({ results: results.slice(0, 30) });
}
