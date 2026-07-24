import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// GET /api/photos — все фото (с фильтрами ?dayId= &placeId= &participantId=)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dayId = searchParams.get("dayId");
  const placeId = searchParams.get("placeId");
  const participantId = searchParams.get("participantId");

  const where: Record<string, unknown> = {};
  if (dayId) where.dayId = dayId;
  if (placeId) where.placeId = placeId;
  if (participantId) where.participantId = participantId;

  const photos = await db.photo.findMany({
    where,
    orderBy: { takenAt: "desc" },
    include: { place: true, participant: true, day: { select: { dayNumber: true, city: true, cityKey: true } } },
  });
  return NextResponse.json(photos);
}

// POST /api/photos — загрузка фото (multipart form)
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const dayId = formData.get("dayId") as string;
  const placeId = (formData.get("placeId") as string) || null;
  const participantId = (formData.get("participantId") as string) || null;
  const caption = (formData.get("caption") as string) || null;
  const lat = formData.get("lat") ? parseFloat(formData.get("lat") as string) : null;
  const lng = formData.get("lng") ? parseFloat(formData.get("lng") as string) : null;
  const address = (formData.get("address") as string) || null;

  if (!file || !dayId) {
    return NextResponse.json({ error: "file and dayId required" }, { status: 400 });
  }

  // сохранить файл
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `${randomUUID()}.${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, fileName);
  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  const url = `/uploads/${fileName}`;

  const photo = await db.photo.create({
    data: {
      url,
      thumbUrl: url,
      caption,
      dayId,
      placeId,
      participantId,
      lat,
      lng,
      address,
      takenAt: new Date(),
    },
    include: { place: true, participant: true, day: true },
  });
  return NextResponse.json(photo);
}

// DELETE /api/photos?id=...
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.photo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
