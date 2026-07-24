import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/phrases?category=basics&favorite=true
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const favorite = searchParams.get("favorite") === "true";
  const where: Record<string, unknown> = {};
  if (category && category !== "all") where.category = category;
  if (favorite) where.favorite = true;
  const phrases = await db.phrase.findMany({
    where,
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(phrases);
}

// PATCH — отметить/снять избранное
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, favorite } = body;
  const phrase = await db.phrase.update({ where: { id }, data: { favorite } });
  return NextResponse.json(phrase);
}
