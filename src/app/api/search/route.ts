import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { currencySymbol } from "@/lib/currencies";

// GET /api/search?q=…&tripId=… — поиск только внутри поездки участника
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase();
  const tripId = searchParams.get("tripId");

  if (!q || q.length < 2) return NextResponse.json({ results: [] });
  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { currency: true } });
  const sym = currencySymbol(trip?.currency);

  const results: Array<{
    id: string;
    type: "place" | "phrase" | "food" | "expense" | "journal";
    title: string;
    subtitle: string;
    meta?: string;
    icon: string;
    dayNumber?: number | null;
    href?: string;
  }> = [];

  const places = await db.place.findMany({
    where: {
      tripId,
      OR: [
        { name: { contains: q } },
        { description: { contains: q } },
        { address: { contains: q } },
        { notes: { contains: q } },
      ],
    },
    take: 8,
  });
  for (const p of places) {
    const day = await db.day.findUnique({ where: { id: p.dayId } });
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

  const phrases = await db.phrase.findMany({
    where: {
      tripId,
      OR: [
        { ru: { contains: q } },
        { cn: { contains: q } },
        { pinyin: { contains: q } },
      ],
    },
    take: 8,
  });
  for (const p of phrases) {
    results.push({
      id: `phrase-${p.id}`,
      type: "phrase",
      title: p.ru,
      subtitle: `${p.cn} · ${p.pinyin}`,
      meta: "Фраза",
      icon: "💬",
    });
  }

  const foods = await db.foodItem.findMany({
    where: {
      tripId,
      OR: [
        { name: { contains: q } },
        { nameCn: { contains: q } },
        { description: { contains: q } },
        { place: { contains: q } },
      ],
    },
    take: 8,
  });
  for (const f of foods) {
    results.push({
      id: `food-${f.id}`,
      type: "food",
      title: f.name,
      subtitle: f.description.slice(0, 80),
      meta: `${f.emoji || "🍽️"} ${f.price || ""}`,
      icon: f.emoji || "🍽️",
    });
  }

  const expenses = await db.expense.findMany({
    where: { tripId, description: { contains: q } },
    take: 5,
  });
  for (const e of expenses) {
    results.push({
      id: `expense-${e.id}`,
      type: "expense",
      title: e.description,
      subtitle: `${sym}${e.amount} · ${e.category}`,
      meta: "Трата",
      icon: "💸",
    });
  }

  const journals = await db.journalEntry.findMany({
    where: { tripId, content: { contains: q } },
    take: 5,
  });
  for (const j of journals) {
    const day = await db.day.findUnique({ where: { id: j.dayId } });
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

  return NextResponse.json({ results });
}
