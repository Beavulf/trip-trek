import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { requireTripMember } from "@/lib/api-auth";
import { UPLOADS_ROOT } from "@/lib/storage/root";
import { PUBLIC_PHOTO_ORDER } from "@/lib/public-photos";
import { zipStream, zipEntryName, type ZipEntry } from "@/lib/zip";

export const dynamic = "force-dynamic";

// GET /api/photos/zip?tripId= — ZIP всех фото поездки для участников (в т.ч. зрителей).
// В отличие от гостевого /p/<token>/photos.zip: скрытые от гостей кадры ВКЛЮЧАЮТСЯ —
// участники видят их в галерее, а referTripMember уже проверил доступ. Лимит 6/ч
// (архив тяжёлый для тома; регулярное «скачать всё» лучше делать редко).
// Поток и zip64 — те же, что у гостевого (src/lib/zip.ts).

export async function GET(req: NextRequest) {
  const limited = rateLimitMiddleware(req, "member-zip", 6, 60 * 60_000);
  if (limited) return limited;

  const tripId = new URL(req.url).searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      title: true,
      photos: {
        orderBy: PUBLIC_PHOTO_ORDER,
        select: {
          url: true,
          caption: true,
          takenAt: true,
          day: { select: { dayNumber: true } },
        },
      },
    },
  });
  if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });
  if (trip.photos.length === 0) {
    return NextResponse.json({ error: "В поездке пока нет фото" }, { status: 404 });
  }

  const uploadsRoot = UPLOADS_ROOT();
  const photos = trip.photos;

  // Читаем по одному файлу за раз: в памяти только текущий кадр, поток сразу уходит в ответ
  async function* entries(): AsyncIterable<ZipEntry> {
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const file = path.basename(photo.url);
      const ext = path.extname(file);
      const base = [
        photo.day ? `день-${photo.day.dayNumber}` : "",
        photo.caption || "",
      ]
        .filter(Boolean)
        .join("-");
      try {
        const data = await readFile(path.join(uploadsRoot, file));
        yield {
          name: zipEntryName(i + 1, base, ext),
          data,
          mtime: photo.takenAt,
        };
      } catch {
        // Файл исчез с диска (ручная чистка тома) — пропускаем, архив остаётся валидным
      }
    }
  }

  return new Response(zipStream(entries()), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="triptrek-photos.zip"; filename*=UTF-8''${encodeURIComponent(
        `${trip.title}.zip`,
      )}`,
      "Cache-Control": "no-store",
    },
  });
}
