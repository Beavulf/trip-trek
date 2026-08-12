import { NextRequest, NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember } from "@/lib/api-auth";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpg",
  "",
]);

// GET /api/photos?tripId=...&dayId=...&placeId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const dayId = searchParams.get("dayId");
  const placeId = searchParams.get("placeId");
  const userId = searchParams.get("userId");

  if (!tripId) return NextResponse.json([]);

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const where: Record<string, unknown> = { tripId };
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

async function processUpload(file: File): Promise<{ url: string; thumbUrl: string }> {
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const id = crypto.randomUUID();
  const raw = Buffer.from(await file.arrayBuffer());

  try {
    const pipeline = sharp(raw, { failOn: "none" }).rotate();
    const fullBuf = await pipeline
      .clone()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    const thumbBuf = await sharp(fullBuf)
      .resize(480, 480, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    const fileName = `${id}.jpg`;
    const thumbName = `${id}-thumb.jpg`;
    await writeFile(path.join(uploadDir, fileName), fullBuf);
    await writeFile(path.join(uploadDir, thumbName), thumbBuf);
    return { url: `/uploads/${fileName}`, thumbUrl: `/uploads/${thumbName}` };
  } catch (e) {
    console.error("[photos] sharp convert failed:", e);
    // Fallback: store original only if already a web-friendly type
    const type = (file.type || "").toLowerCase();
    if (type === "image/jpeg" || type === "image/jpg" || type === "image/png" || type === "image/webp") {
      const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const fileName = `${id}.${ext}`;
      await writeFile(path.join(uploadDir, fileName), raw);
      const url = `/uploads/${fileName}`;
      return { url, thumbUrl: url };
    }
    throw new Error(
      "Не удалось обработать фото (часто HEIC). Сохраните как JPEG и попробуйте снова"
    );
  }
}

// POST — загрузка фото
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const dayId = formData.get("dayId") as string;
  const tripId = formData.get("tripId") as string;

  if (!file || !dayId || !tripId) {
    return NextResponse.json({ error: "file, dayId, tripId required" }, { status: 400 });
  }

  const { user, response } = await requireTripMember(req, tripId);
  if (response) return response;

  if (file.type && !ALLOWED.has(file.type.toLowerCase())) {
    return NextResponse.json({ error: "Недопустимый тип файла" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Файл слишком большой (макс 20MB)" }, { status: 400 });
  }

  const placeId = (formData.get("placeId") as string) || null;
  const userId = user!.id;
  const caption = (formData.get("caption") as string) || null;
  const lat = formData.get("lat") ? parseFloat(formData.get("lat") as string) : null;
  const lng = formData.get("lng") ? parseFloat(formData.get("lng") as string) : null;
  const address = (formData.get("address") as string) || null;

  let urls: { url: string; thumbUrl: string };
  try {
    urls = await processUpload(file);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка обработки фото";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const photo = await db.photo.create({
    data: {
      url: urls.url,
      thumbUrl: urls.thumbUrl,
      caption,
      dayId,
      tripId,
      placeId,
      userId,
      lat,
      lng,
      address,
      takenAt: new Date(),
    },
    include: { place: true, user: true, day: true },
  });
  emitWS("photo:added", tripId, {
    userId: user!.id,
    userName: user!.name || photo.user?.name || "Кто-то",
  });
  return NextResponse.json(photo);
}

// DELETE
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await db.photo.findUnique({
    where: { id },
    select: { tripId: true, url: true, thumbUrl: true, userId: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { user, membership, response } = await requireTripMember(req, existing.tripId);
  if (response) return response;

  // Только автор или owner поездки
  const isAuthor = existing.userId === user!.id;
  const isOwner = membership!.role === "owner";
  if (!isAuthor && !isOwner) {
    return NextResponse.json({ error: "Можно удалять только свои фото" }, { status: 403 });
  }

  const photo = await db.photo.delete({ where: { id } });

  for (const rel of [photo.url, photo.thumbUrl]) {
    if (!rel) continue;
    try {
      const relPath = rel.replace(/^\//, "");
      await unlink(path.join(process.cwd(), "public", relPath));
    } catch {
      // ignore missing files
    }
  }

  emitWS("photo:deleted", photo.tripId, { photoId: id });
  return NextResponse.json({ ok: true });
}
