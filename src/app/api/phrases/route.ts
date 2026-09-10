import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember } from "@/lib/api-auth";

const PHRASE_CATEGORIES = ["basics", "food", "transport", "shopping", "emergency", "social"];

// GET /api/phrases?tripId=...&category=...&favorite=true
// P0 #1: tripId required — без него 400 (раньше пустая строка → where={} → все фразы всех поездок)
// P0 #2: auth + membership
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const category = searchParams.get("category");
  const favorite = searchParams.get("favorite") === "true";
  const where: Record<string, unknown> = { tripId };
  if (category && category !== "all") where.category = category;
  if (favorite) where.favorite = true;

  const phrases = await db.phrase.findMany({
    where,
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(phrases);
}

// POST — своя фраза (общая для компании, как и избранное)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tripId, ru, cn, pinyin, category, language } = body;

  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  if (!ru?.trim() || !cn?.trim()) {
    return NextResponse.json({ error: "ru и cn обязательны" }, { status: 400 });
  }

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const cat = PHRASE_CATEGORIES.includes(category) ? category : "basics";
  const last = await db.phrase.findFirst({
    where: { tripId, category: cat },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const phrase = await db.phrase.create({
    data: {
      tripId,
      category: cat,
      ru: ru.trim().slice(0, 200),
      cn: cn.trim().slice(0, 300),
      pinyin: (pinyin ?? "").trim().slice(0, 200),
      language: typeof language === "string" ? language.trim().slice(0, 12) || null : null,
      order: (last?.order ?? 0) + 1,
    },
  });
  await publish(tripId, "phrase:updated", {});
  return NextResponse.json(phrase, { status: 201 });
}

// PATCH — toggle favorite / правка текста своей фразы
// P0 #2: membership check via phrase.tripId (было)
// P1 #8: await emitWS
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, favorite, ru, cn, pinyin, category } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (ru !== undefined && !ru.trim()) return NextResponse.json({ error: "ru не может быть пустым" }, { status: 400 });
  if (cn !== undefined && !cn.trim()) return NextResponse.json({ error: "cn не может быть пустым" }, { status: 400 });

  // Lookup tripId from existing phrase for auth
  const existing = await db.phrase.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const data: Record<string, unknown> = {};
  if (favorite !== undefined) data.favorite = !!favorite;
  if (ru !== undefined) data.ru = ru.trim().slice(0, 200);
  if (cn !== undefined) data.cn = cn.trim().slice(0, 300);
  if (pinyin !== undefined) data.pinyin = pinyin.trim().slice(0, 200);
  if (category !== undefined && PHRASE_CATEGORIES.includes(category)) data.category = category;

  const phrase = await db.phrase.update({ where: { id }, data });
  await publish(phrase.tripId, "phrase:updated", {});
  return NextResponse.json(phrase);
}

// DELETE — удалить фразу (в т.ч. сгенерированную; фразы — общий ресурс поездки)
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await db.phrase.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  await db.phrase.delete({ where: { id } });
  await publish(existing.tripId, "phrase:updated", {});
  return NextResponse.json({ ok: true });
}
