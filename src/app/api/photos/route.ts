import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember, requireUser } from "@/lib/api-auth";
import { put as storagePut, remove as storageRemove, StorageError } from "@/lib/storage";
import { userRateLimit } from "@/lib/rate-limit";

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
      user: { select: { id: true, name: true, color: true, emoji: true, avatarUrl: true } },
      day: { select: { dayNumber: true, city: true, cityKey: true } },
    },
  });
  return NextResponse.json(photos);
}

// POST — загрузка фото
export async function POST(req: NextRequest) {
  // requireUser ДО парсинга multipart: анонимный запрос не должен заставлять
  // сервер буферизовать 20MB в памяти (аудит 2026-09-12). tripId лежит в форме,
  // поэтому membership-проверка — только после parse.
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const dayId = formData.get("dayId") as string;
  const tripId = formData.get("tripId") as string;

  if (!file || !dayId || !tripId) {
    return NextResponse.json({ error: "file, dayId, tripId required" }, { status: 400 });
  }

  const { user, response } = await requireTripMember(req, tripId);
  if (response) return response;

  // 20 фото в час на пользователя — sharp тяжёлый, диск не резиновый
  const limited = userRateLimit(req, user!.id, "photos", 20, 60 * 60_000);
  if (limited) return limited;

  // dayId обязан принадлежать этой поездке — проверяем ДО тяжёлой обработки
  // файла (аудит 2026-09-12; как в journal)
  const day = await db.day.findFirst({ where: { id: dayId, tripId }, select: { id: true } });
  if (!day) {
    return NextResponse.json({ error: "day не принадлежит этой поездке" }, { status: 400 });
  }

  const placeId = (formData.get("placeId") as string) || null;
  const userId = user!.id;
  const caption = (formData.get("caption") as string) || null;
  const lat = formData.get("lat") ? parseFloat(formData.get("lat") as string) : null;
  const lng = formData.get("lng") ? parseFloat(formData.get("lng") as string) : null;
  const address = (formData.get("address") as string) || null;

  // Единая политика хранилища: magic bytes, лимит 20MB, sharp-обработка
  // (EXIF/GPS выпиливаются), никакого raw-fallback
  let urls: { url: string; thumbUrl?: string };
  try {
    urls = await storagePut({ data: Buffer.from(await file.arrayBuffer()), kind: "photo" });
  } catch (e) {
    if (e instanceof StorageError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[photos] upload failed:", e);
    return NextResponse.json({ error: "Ошибка обработки фото" }, { status: 500 });
  }

  const photo = await db.photo.create({
    data: {
      url: urls.url,
      thumbUrl: urls.thumbUrl ?? urls.url,
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
    // user — проекцией, а не целиком: include user:true тянет в ответ весь ряд
    // юзера вместе с хешем пароля (привычка из journal/photos GET)
    include: {
      place: true,
      day: true,
      user: { select: { id: true, name: true, emoji: true, color: true, avatarUrl: true } },
    },
  });
  publish(tripId, "photo:added", {
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

  // Файлы — не транзакционны с БД: чистим после успешного delete,
  // отсутствующий файл не ошибка
  for (const rel of [photo.url, photo.thumbUrl]) {
    if (!rel) continue;
    try {
      await storageRemove(rel);
    } catch {
      // мусор в url — не повод ломать удаление записи
    }
  }

  publish(photo.tripId, "photo:deleted", { photoId: id });
  return NextResponse.json({ ok: true });
}
