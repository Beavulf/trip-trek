import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember } from "@/lib/api-auth";

// GET /api/foods?tripId=...&city=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const city = searchParams.get("city");
  const where: Record<string, unknown> = {};
  if (tripId) where.tripId = tripId;
  if (city && city !== "all") where.city = city;

  const foods = await db.foodItem.findMany({
    where,
    orderBy: [{ city: "asc" }, { order: "asc" }],
  });
  return NextResponse.json(foods);
}

// POST /api/foods — добавить блюдо
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tripId, name, nameCn, description, city, place, price, emoji } = body;

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  if (!tripId || !name || !city) {
    return NextResponse.json({ error: "tripId, name, city required" }, { status: 400 });
  }

  // Максимальный order
  const maxOrder = await db.foodItem.findFirst({
    where: { tripId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const food = await db.foodItem.create({
    data: {
      tripId,
      name,
      nameCn: nameCn || null,
      description: description || "",
      city,
      place: place || null,
      price: price || null,
      emoji: emoji || "🍽️",
      order: (maxOrder?.order ?? 0) + 1,
    },
  });

  emitWS("food:updated", tripId, {});
  return NextResponse.json(food);
}

// DELETE /api/foods?id=...
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const food = await db.foodItem.findUnique({ where: { id }, select: { tripId: true } });
  if (!food) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { response } = await requireTripMember(req, food.tripId);
  if (response) return response;

  await db.foodItem.delete({ where: { id } });
  emitWS("food:updated", food.tripId, {});
  return NextResponse.json({ ok: true });
}

// PATCH — multipart (photo upload) or JSON
export async function PATCH(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const id = formData.get("id") as string;
    if (!file || !id) return NextResponse.json({ error: "file and id required" }, { status: 400 });
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `food-${crypto.randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
    const url = `/uploads/${fileName}`;
    const food = await db.foodItem.update({ where: { id }, data: { imageUrl: url } });
    emitWS("food:updated", food.tripId, {});
    return NextResponse.json(food);
  }

  const body = await req.json();
  const { id, tried, rating, imageUrl } = body;
  const data: Record<string, unknown> = {};
  if (typeof tried === "boolean") data.tried = tried;
  if (typeof rating === "number" || rating === null) data.rating = rating;
  if (typeof imageUrl === "string" || imageUrl === null) data.imageUrl = imageUrl;
  const food = await db.foodItem.update({ where: { id }, data });
  emitWS("food:updated", food.tripId, {});
  return NextResponse.json(food);
}

import { writeFile, mkdir } from "fs/promises";
import path from "path";
