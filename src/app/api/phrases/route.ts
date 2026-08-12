import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember } from "@/lib/api-auth";

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

// PATCH — toggle favorite
// P0 #2: membership check via phrase.tripId (было)
// P1 #8: await emitWS
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, favorite } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Lookup tripId from existing phrase for auth
  const existing = await db.phrase.findUnique({ where: { id }, select: { tripId: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  const phrase = await db.phrase.update({ where: { id }, data: { favorite: !!favorite } });
  await emitWS("phrase:updated", phrase.tripId, {});
  return NextResponse.json(phrase);
}
