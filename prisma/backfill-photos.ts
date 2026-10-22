/**
 * Backfill метаданных фото: width/height (из них строится aspect-ratio плитки галереи)
 * и миниатюры для старых снимков (загружены до sharp-пайплайна или до появления полей).
 * Идемпотентен, ничего не удаляет и не трогает оригиналы — только дописывает.
 *
 *   bun prisma/backfill-photos.ts            # сухой прогон: только отчёт, ничего не пишет
 *   bun prisma/backfill-photos.ts --apply    # записать размеры и недостающие миниатюры
 *   bun prisma/backfill-photos.ts --apply --limit=50   # порциями
 *   docker compose exec app bun prisma/backfill-photos.ts --apply   # на проде
 */
import { access, writeFile } from "fs/promises";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { StorageError, imageDisplaySize, makeThumb, uploadPath } from "../src/lib/storage";

const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

// Крутится рядом с боевым приложением на слабом VPS: один поток и без кэша libvips,
// иначе пик памяти на 12-мегапиксельных оригиналах задевает основной процесс
sharp.concurrency(1);
sharp.cache(false);

const exists = (p: string) => access(p).then(() => true, () => false);

/** /uploads/<имя>.<расш> → /uploads/<имя>-thumb.jpg — то же правило имён, что в storage.put */
const thumbUrlFor = (url: string) => url.replace(/\.[^./]+$/, "") + "-thumb.jpg";

async function main() {
  const photos = await db.photo.findMany({
    select: { id: true, url: true, thumbUrl: true, width: true, height: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Фото в базе: ${photos.length} (${apply ? "ЗАПИСЬ" : "сухой прогон, добавьте --apply для записи"})`);

  const stat = { upToDate: 0, dims: 0, thumbs: 0, missingFile: 0, external: 0, errors: 0 };
  let processed = 0;

  for (const p of photos) {
    if (processed >= limit) break;

    let origPath: string;
    try {
      origPath = uploadPath(p.url);
    } catch (e) {
      // внешний/чужой url (импорт, мусор) — файла в нашем хранилище нет, трогать нечего
      if (e instanceof StorageError) {
        stat.external++;
        continue;
      }
      throw e;
    }

    const needDims = !p.width || !p.height;
    // Миниатюра есть, если thumbUrl задан, отличается от оригинала И файл реально лежит на диске
    let hasThumb = !!p.thumbUrl && p.thumbUrl !== p.url;
    if (hasThumb) {
      try {
        hasThumb = await exists(uploadPath(p.thumbUrl!));
      } catch {
        hasThumb = false;
      }
    }
    if (!needDims && hasThumb) {
      stat.upToDate++;
      continue;
    }

    processed++;
    if (!(await exists(origPath))) {
      stat.missingFile++;
      console.log(`✗ ${p.id}: нет файла ${p.url}`);
      continue;
    }

    try {
      const data: { width?: number; height?: number; thumbUrl?: string } = {};
      if (needDims) {
        const size = await imageDisplaySize(origPath);
        if (size) {
          data.width = size.width;
          data.height = size.height;
        }
      }
      if (!hasThumb) {
        const thumbUrl = thumbUrlFor(p.url);
        // Файл раньше записи в БД: оборвёмся между шагами — останется безобидный файл-сирота
        if (apply) await writeFile(uploadPath(thumbUrl), await makeThumb(origPath));
        data.thumbUrl = thumbUrl;
        stat.thumbs++;
      }
      if (data.width) stat.dims++;
      if (apply && Object.keys(data).length > 0) await db.photo.update({ where: { id: p.id }, data });
      console.log(
        `✓ ${p.id}: ${data.width ? `${data.width}×${data.height}` : "размеры уже есть"}${data.thumbUrl ? `, миниатюра ${data.thumbUrl}` : ""}`
      );
    } catch (e) {
      stat.errors++;
      console.log(`✗ ${p.id}: ${(e as Error).message}`);
    }
  }

  console.log(
    `\nИтого: актуальных ${stat.upToDate}, размеры ${stat.dims}, миниатюры ${stat.thumbs}, ` +
      `нет файла ${stat.missingFile}, внешних url ${stat.external}, ошибок ${stat.errors}` +
      (apply ? "" : "\nСухой прогон — в базе и на диске ничего не изменено.")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
