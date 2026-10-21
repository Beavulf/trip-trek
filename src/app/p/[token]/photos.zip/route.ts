import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { UPLOADS_ROOT } from "@/lib/storage/root";
import { zipStream, zipEntryName, type ZipEntry } from "@/lib/zip";

export const dynamic = "force-dynamic";

// GET /p/<token>/photos.zip — ZIP всех фото поездки для гостей публичной страницы.
// Работает только при shareEnabled и тумблере владельца shareAllowDownload;
// по IP — 5 архивов в час (публичный эндпоинт, жёсткий лимит от качалок).

const MAX_PHOTOS = 1000;

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limited = rateLimitMiddleware(req, "share-zip", 5, 60 * 60_000);
  if (limited) return limited;

  const { token } = await ctx.params;
  const trip = await db.trip.findFirst({
    where: { shareToken: token, shareEnabled: true },
    select: {
      title: true,
      shareAllowDownload: true,
      photos: {
        // Хронологический порядок — архив читается как история поездки
        orderBy: { takenAt: "asc" },
        take: MAX_PHOTOS,
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
  if (!trip.shareAllowDownload) {
    return NextResponse.json({ error: "Владелец запретил скачивание" }, { status: 403 });
  }
  if (trip.photos.length === 0) {
    return NextResponse.json({ error: "В поездке пока нет фото" }, { status: 404 });
  }

  const uploadsRoot = UPLOADS_ROOT();
  const photos = trip.photos;

  // Читаем по одному файлу за раз: генератор держит в памяти только текущий
  // кадр, а поток сразу уходит в ответ — гость видит загрузку с первого файла
  async function* entries(): AsyncIterable<ZipEntry> {
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      // url формата "/uploads/<uuid>.<ext>": basename отсекает любые пути
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

  const asciiName = "triptrek-photos.zip";
  return new Response(zipStream(entries()), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
        `${trip.title}.zip`
      )}`,
      "Cache-Control": "no-store",
    },
  });
}
