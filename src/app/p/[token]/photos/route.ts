import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /p/<token>/photos — порции фото публичной страницы после первой партии из SSR
// (page.tsx отдаёт первые 200, клиент тихо докачивает остальное отсюда).
// Публичный: доступ определяется самим токеном шаринга; по IP — 60/ч
// (гостю нужно несколько запросов на просмотр, качалкам этого не хватит).
//
// Пагинация — keyset по [takenAt desc, id desc]: курсор «takenAt~id» не зависит
// от существования строки (в отличие от Prisma-cursor, который падает P2025,
// если фото удалили между запросами гостя) и стабилен при дописывании фото.

const PAGE_SIZE = 500;

/** Курсор — непрозрачная строка «takenAt ISO~id»; «~» не встречается ни в ISO, ни в cuid */
function encodeCursor(takenAt: Date, id: string): string {
  return `${takenAt.toISOString()}~${id}`;
}

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
  let cursorAt: Date | null = null;
  let cursorId: string | null = null;
  if (raw) {
    const sep = raw.lastIndexOf("~");
    const parsed = sep > 0 ? new Date(raw.slice(0, sep)) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || sep === raw.length - 1) {
      return NextResponse.json({ error: "Кривой курсор" }, { status: 400 });
    }
    cursorAt = parsed;
    cursorId = raw.slice(sep + 1);
  }

  const photos = await db.photo.findMany({
    where: {
      tripId: trip.id,
      ...(cursorAt && cursorId
        ? {
            OR: [
              { takenAt: { lt: cursorAt } },
              { takenAt: cursorAt, id: { lt: cursorId } },
            ],
          }
        : {}),
    },
    orderBy: [{ takenAt: "desc" }, { id: "desc" }],
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
      nextCursor: photos.length === PAGE_SIZE && last ? encodeCursor(last.takenAt, last.id) : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
