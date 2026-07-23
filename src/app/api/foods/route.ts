import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/foods?city=guangzhou
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");
  const where = city && city !== "all" ? { city } : undefined;
  const foods = await db.foodItem.findMany({
    where,
    orderBy: [{ city: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(foods);
}

// PATCH — отметить пробовал/рейтинг
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, tried, rating } = body;
  const data: Record<string, unknown> = {};
  if (typeof tried === "boolean") data.tried = tried;
  if (typeof rating === "number" || rating === null) data.rating = rating;
  const food = await db.foodItem.update({ where: { id }, data });
  return NextResponse.json(food);
}
