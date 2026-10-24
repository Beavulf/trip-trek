import { statfs } from "node:fs/promises";
import path from "node:path";

// Защита одного VPS от переполнения диска фотографиями. База лежит на том же диске, поэтому
// «кончилось место» ломает не только загрузку, но и всё приложение. Чистая логика (diskLevel,
// формулировки) отделена от чтения диска — её проверяют тесты.

export interface DiskSpace {
  freeBytes: number;
  totalBytes: number;
}

export type DiskLevel = "ok" | "low" | "critical";

const GIB = 1024 ** 3;

/** Свободно меньше этого — загрузку фото отклоняем (остаток нужен базе, логам и бэкапам). */
export function criticalFreeBytes(): number {
  const mb = Number(process.env.PHOTO_MIN_FREE_MB);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : GIB;
}

/** Порог предупреждения админу: свободно меньше 3 ГБ или меньше 15% диска. */
const LOW_FREE_BYTES = 3 * GIB;
const LOW_FREE_SHARE = 0.15;

export function diskLevel(d: DiskSpace | null, criticalBytes = criticalFreeBytes()): DiskLevel {
  if (!d || d.totalBytes <= 0) return "ok"; // прочитать не удалось — не блокируем загрузки зря
  if (d.freeBytes < criticalBytes) return "critical";
  if (d.freeBytes < LOW_FREE_BYTES || d.freeBytes / d.totalBytes < LOW_FREE_SHARE) return "low";
  return "ok";
}

/**
 * Свободное место на диске, где лежит каталог. Каталог загрузок создаётся лениво и может ещё
 * не существовать — тогда смотрим ближайший существующий родитель (диск тот же).
 */
export async function readDiskSpace(dir: string): Promise<DiskSpace | null> {
  let current = path.resolve(dir);
  for (let i = 0; i < 6; i++) {
    try {
      const s = await statfs(current);
      return { freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) };
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
  return null;
}

// Роут загрузки вызывается на каждый кадр батча — статистику диска читаем не чаще раза в полминуты
const CACHE_MS = 30_000;
let cache: { at: number; dir: string; value: DiskSpace | null } | null = null;

export async function readDiskSpaceCached(dir: string, now = Date.now()): Promise<DiskSpace | null> {
  if (cache && cache.dir === dir && now - cache.at < CACHE_MS) return cache.value;
  const value = await readDiskSpace(dir);
  cache = { at: now, dir, value };
  return value;
}

export { fmtDiskBytes } from "./disk-space-format";
