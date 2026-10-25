import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import {
  PUBLIC_PHOTO_ORDER,
  decodePhotoCursor,
  encodePhotoCursor,
  photosAfter,
  type PhotoPosition,
} from "@/lib/public-photos";

export const dynamic = "force-dynamic";

// GET /p/<token>/photos — порции фото публичной страницы после первой партии из SSR
// (page.tsx отдаёт первые 200, клиент тихо докачивает остальное отсюда).
// Публичный: доступ определяется самим токеном шаринга; по IP — 60/ч
// (гостю нужно несколько запросов на просмотр, качалкам этого не хватит).
//
// Порядок — по ходу поездки (день ↑, время съёмки ↑, id ↑), см. lib/public-photos.ts.
// Пагинация — keyset: курсор «день~takenAt~id» не зависит от существования строки
// (в отличие от Prisma-cursor, который падает P2025, если фото удалили между
// запросами гостя) и стабилен при дописывании фото.

const PAGE_SIZE = 500;

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limited = rateLimitMiddleware(req, "share-photos", 60, 60 * 60_000);
  if (limited) return limited;

  const { token } = await ctx.params;
  const trip = await db.trip.findFirst({
    where: { shareToken: token, shareEnabled: true },
    select: { id: true },
  });
  if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });

  const raw = req.nextUrl.searchParams.get("cursor");
  let after: PhotoPosition | null = null;
  if (raw) {
    after = decodePhotoCursor(raw);
    if (!after) return NextResponse.json({ error: "Кривой курсор" }, { status: 400 });
  }

  const photos = await db.photo.findMany({
    where: { tripId: trip.id, ...(after ? photosAfter(after) : {}) },
    orderBy: PUBLIC_PHOTO_ORDER,
    take: PAGE_SIZE,
    select: {
      id: true,
      url: true,
      thumbUrl: true,
      width: true,
      height: true,
      caption: true,
      isFavorite: true,
      lat: true,
      lng: true,
      takenAt: true,
      place: { select: { name: true } },
      day: { select: { dayNumber: true } },
    },
  });

  const last = photos[photos.length - 1];
  return NextResponse.json(
    {
      photos: photos.map((p) => ({
        id: p.id,
        url: p.url,
        thumbUrl: p.thumbUrl ?? p.url,
        width: p.width,
        height: p.height,
        caption: p.caption,
        isFavorite: p.isFavorite,
        lat: p.lat,
        lng: p.lng,
        takenAt: p.takenAt.toISOString(),
        placeName: p.place?.name ?? null,
        dayNumber: p.day?.dayNumber ?? null,
      })),
      nextCursor:
        photos.length === PAGE_SIZE && last?.day
          ? encodePhotoCursor({ dayNumber: last.day.dayNumber, takenAt: last.takenAt, id: last.id })
          : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
