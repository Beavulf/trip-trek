import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember, requireUser, requireTripEditor } from "@/lib/api-auth";
import { put as storagePut, remove as storageRemove, StorageError } from "@/lib/storage";
import { limit } from "@/lib/rate-limit";

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
    take: 1000,
    where,
    orderBy: { takenAt: "desc" },
    include: {
      // place — только поля, которые читает клиент (lightbox: название места);
      // полный ряд Place здесь не нужен (аудит перфоманса 2026-09-13)
      place: { select: { name: true, lat: true, lng: true } },
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

  const { user, response } = await requireTripEditor(req, tripId);
  if (response) return response;

  // 500 фото в час на пользователя. История лимита: 20/час рвали вечерний
  // батч (Китай), 150/час — исчерпывались активным тестированием (несколько
  // батчей по 30–50 кадров за час — нормальный сценарий, 2026-10-21: 149
  // за час и 429 на хвосте). 500/час всё ещё защищает sharp/диск от абьюза.
  const rl = limit(`photos:${user!.id}`, { max: 500, windowMs: 60 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Лимит загрузки фото исчерпан (500 в час). Подожди немного — уже загруженное не задвоится.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec || 600) } }
    );
  }

  // Размер файла известен из multipart ДО чтения в память: гигантский файл
  // не должен буферизоваться, чтобы получить честный 413 от storagePut
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "Файл слишком большой (макс 20MB)" }, { status: 413 });
  }

  // dayId обязан принадлежать этой поездке — проверяем ДО тяжёлой обработки
  // файла (аудит 2026-09-12; как в journal)
  const day = await db.day.findFirst({ where: { id: dayId, tripId }, select: { id: true } });
  if (!day) {
    return NextResponse.json({ error: "day не принадлежит этой поездке" }, { status: 400 });
  }

  const placeId = (formData.get("placeId") as string) || null;
  const userId = user!.id;
  const caption = ((formData.get("caption") as string) || "").slice(0, 300) || null;
  // Координаты от клиента — не доверенный ввод: мусор/вне диапазона → null
  // (NaN в Prisma-Float падал бы 500), GPS из EXIF их всё равно надёжнее
  const latRaw = formData.get("lat") ? parseFloat(formData.get("lat") as string) : null;
  const lngRaw = formData.get("lng") ? parseFloat(formData.get("lng") as string) : null;
  const lat = latRaw !== null && Number.isFinite(latRaw) && Math.abs(latRaw) <= 90 ? latRaw : null;
  const lng = lngRaw !== null && Number.isFinite(lngRaw) && Math.abs(lngRaw) <= 180 ? lngRaw : null;
  const address = ((formData.get("address") as string) || "").slice(0, 300) || null;
  // Отпечаток содержимого (sha256 оригинала, считает клиент): тот же кадр —
  // тот же отпечаток, повтор в поездке отклоняем (дедуп вечерних батчей)
  const contentHash = ((formData.get("contentHash") as string) || "").toLowerCase();
  if (contentHash) {
    if (!/^[0-9a-f]{64}$/.test(contentHash)) {
      return NextResponse.json({ error: "contentHash: ожидается sha256-hex" }, { status: 400 });
    }
    const dup = await db.photo.findFirst({
      where: { tripId, contentHash },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { error: "Это фото уже загружено в поездку", duplicateOf: dup.id },
        { status: 409 }
      );
    }
  }
  // Дата съёмки из EXIF (клиент читает до загрузки — storage EXIF выпиливает).
  // Валидируем: часы камеры врут в обе стороны; мусор → время загрузки как раньше
  const takenAtRaw = formData.get("takenAt") as string | null;
  let takenAt = new Date();
  if (takenAtRaw) {
    const parsed = new Date(takenAtRaw);
    const now = Date.now();
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() < Date.UTC(2000, 0, 1) || parsed.getTime() > now + 5 * 60_000) {
      takenAt = new Date();
    } else {
      takenAt = parsed;
    }
  }
  // Батч-загрузка: все кадры кроме последнего клиент помечает suppressPush —
  // друзья получают ОДИН пуш «добавил 50 фото», а не 50 пушей
  const silent = formData.get("suppressPush") === "1";
  const batchCount = Math.max(1, Math.min(9999, parseInt(formData.get("count") as string, 10) || 0));

  // Единая политика хранилища: magic bytes, лимит 20MB, sharp-обработка
  // (EXIF/GPS выпиливаются), никакого raw-fallback
  let urls: { url: string; thumbUrl?: string; width?: number; height?: number };
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
      // Размеры файла → aspect-ratio плитки галереи: без них masonry считает каждую
      // плитку заглушкой и подтягивает лишние картинки, а колонки прыгают на загрузке
      width: urls.width ?? null,
      height: urls.height ?? null,
      caption,
      dayId,
      tripId,
      placeId,
      userId,
      lat,
      lng,
      address,
      takenAt,
      ...(contentHash ? { contentHash } : {}),
    },
    // user — проекцией, а не целиком: include user:true тянет в ответ весь ряд
    // юзера вместе с хешем пароля (привычка из journal/photos GET)
    include: {
      day: true,
      user: { select: { id: true, name: true, emoji: true, color: true, avatarUrl: true } },
    },
  });
  publish(
    tripId,
    "photo:added",
    {
      userId: user!.id,
      userName: user!.name || photo.user?.name || "Кто-то",
      ...(batchCount > 1 ? { count: batchCount } : {}),
    },
    user!.id,
    { silent }
  );
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
  const { user, membership, response } = await requireTripEditor(req, existing.tripId);
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
