import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/search?q=лапша&tripId=... — глобальный поиск по местам, фразам, блюдам, тратам, дневнику
// P1 #11: journal scoped by tripId (раньше без фильтра → все записи всех поездок)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase();
  const tripId = searchParams.get("tripId");
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const results: Array<{
    id: string;
    type: "place" | "phrase" | "food" | "expense" | "journal";
    title: string;
    subtitle: string;
    meta?: string;
    icon: string;
    href?: string;
  }> = [];

  // Места
  const places = await db.place.findMany({
    where: {
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
    });
  }

  // Фразы — P0 #4: scoped by tripId если передан (раньше все фразы всех поездок)
  const phraseWhere: Record<string, unknown> = {
    OR: [
      { ru: { contains: q } },
      { cn: { contains: q } },
      { pinyin: { contains: q } },
    ],
  };
  if (tripId) phraseWhere.tripId = tripId;
  const phrases = await db.phrase.findMany({
    where: phraseWhere,
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

  // Блюда
  const foods = await db.foodItem.findMany({
    where: {
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

  // Траты
  const expenses = await db.expense.findMany({
    where: { description: { contains: q } },
    take: 5,
  });
  for (const e of expenses) {
    results.push({
      id: `expense-${e.id}`,
      type: "expense",
      title: e.description,
      subtitle: `$${e.amount} · ${e.category}`,
      meta: "Трата",
      icon: "💸",
    });
  }

  // Дневник — P1 #11: scoped by tripId если передан
  const journalWhere: Record<string, unknown> = { content: { contains: q } };
  if (tripId) journalWhere.tripId = tripId;
  const journals = await db.journalEntry.findMany({
    where: journalWhere,
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
    });
  }

  return NextResponse.json({ results });
}
