import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";

// GET /api/photos?tripId=...&dayId=...&placeId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const dayId = searchParams.get("dayId");
  const placeId = searchParams.get("placeId");
  const userId = searchParams.get("userId");

  const where: Record<string, unknown> = {};
  if (tripId) where.tripId = tripId;
  if (dayId) where.dayId = dayId;
  if (placeId) where.placeId = placeId;
  if (userId) where.userId = userId;

  const photos = await db.photo.findMany({
    where,
    orderBy: { takenAt: "desc" },
    include: {
      place: true,
      user: { select: { id: true, name: true, color: true, emoji: true } },
      day: { select: { dayNumber: true, city: true, cityKey: true } },
    },
  });
  return NextResponse.json(photos);
}

// POST — загрузка фото
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const dayId = formData.get("dayId") as string;
  const tripId = formData.get("tripId") as string;
  const placeId = (formData.get("placeId") as string) || null;
  const userId = (formData.get("userId") as string) || null;
  const caption = (formData.get("caption") as string) || null;
  const lat = formData.get("lat") ? parseFloat(formData.get("lat") as string) : null;
  const lng = formData.get("lng") ? parseFloat(formData.get("lng") as string) : null;
  const address = (formData.get("address") as string) || null;

  if (!file || !dayId || !tripId) {
    return NextResponse.json({ error: "file, dayId, tripId required" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
  const url = `/uploads/${fileName}`;

  const photo = await db.photo.create({
    data: { url, thumbUrl: url, caption, dayId, tripId, placeId, userId, lat, lng, address, takenAt: new Date() },
    include: { place: true, user: true, day: true },
  });
  emitWS("photo:added", tripId, { userName: photo.user?.name || "Кто-то" });
  return NextResponse.json(photo);
}

// DELETE
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const photo = await db.photo.delete({ where: { id } });
  emitWS("photo:added", photo.tripId, {});
  return NextResponse.json({ ok: true });
}

import { writeFile, mkdir } from "fs/promises";
import path from "path";
