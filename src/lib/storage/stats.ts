import { readdir, stat } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { UPLOADS_ROOT } from "./root";

// Статистика хранилища /uploads и поиск «сирот» — файлов на диске,
// на которые не ссылается ни одна запись в БД. Приборка для самохостинга:
// осиротеть могут фото удалённого пользователя, скриншоты отзывов и т.п.

export type StorageKindKey = "photo" | "thumb" | "avatar" | "feedback" | "food";

export interface StorageUsage {
  total: number;
  files: number;
  byKind: Record<StorageKindKey, { bytes: number; files: number }>;
}

export interface OrphanFile {
  url: string;
  bytes: number;
  mtime: string;
}

interface WalkedFile {
  absPath: string;
  relPath: string; // относительно uploads root, без ведущего /
  bytes: number;
  mtimeMs: number;
}

function kindFor(relPath: string): StorageKindKey {
  if (relPath.startsWith("avatars/")) return "avatar";
  if (relPath.startsWith("feedback/")) return "feedback";
  if (/-thumb\.jpg$/i.test(relPath)) return "thumb";
  if (/^food-/.test(path.basename(relPath))) return "food";
  return "photo";
}

async function walk(dir: string): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // нет каталога — нет файлов
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(abs)));
      continue;
    }
    if (!e.isFile()) continue;
    try {
      const s = await stat(abs);
      out.push({
        absPath: abs,
        relPath: path.relative(UPLOADS_ROOT(), abs).split(path.sep).join("/"),
        bytes: s.size,
        mtimeMs: s.mtimeMs,
      });
    } catch {
      // файл исчез между readdir и stat — пропускаем
    }
  }
  return out;
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const files = await walk(UPLOADS_ROOT());
  const byKind: StorageUsage["byKind"] = {
    photo: { bytes: 0, files: 0 },
    thumb: { bytes: 0, files: 0 },
    avatar: { bytes: 0, files: 0 },
    feedback: { bytes: 0, files: 0 },
    food: { bytes: 0, files: 0 },
  };
  for (const f of files) {
    const k = kindFor(f.relPath);
    byKind[k].bytes += f.bytes;
    byKind[k].files += 1;
  }
  return {
    total: files.reduce((a, f) => a + f.bytes, 0),
    files: files.length,
    byKind,
  };
}

/** Все файлы на диске, на которые нет ссылок в БД (старше cutoffMs — свежие не трогаем). */
export async function findOrphans(cutoffMs = 24 * 3_600_000): Promise<OrphanFile[]> {
  const referenced = new Set<string>();
  const [photos, feedbacks, users, foods] = await Promise.all([
    db.photo.findMany({ select: { url: true, thumbUrl: true } }),
    db.feedback.findMany({ select: { screenshotUrl: true } }),
    db.user.findMany({ select: { avatarUrl: true } }),
    db.foodItem.findMany({ select: { imageUrl: true } }),
  ]);
  for (const p of photos) {
    referenced.add(p.url);
    if (p.thumbUrl) referenced.add(p.thumbUrl);
  }
  for (const f of feedbacks) if (f.screenshotUrl) referenced.add(f.screenshotUrl);
  for (const u of users) if (u.avatarUrl) referenced.add(u.avatarUrl);
  for (const f of foods) if (f.imageUrl) referenced.add(f.imageUrl);

  const cutoff = Date.now() - cutoffMs;
  const files = await walk(UPLOADS_ROOT());
  return files
    .filter((f) => f.mtimeMs < cutoff && !referenced.has(`/uploads/${f.relPath}`))
    .sort((a, b) => b.bytes - a.bytes)
    .map((f) => ({
      url: `/uploads/${f.relPath}`,
      bytes: f.bytes,
      mtime: new Date(f.mtimeMs).toISOString(),
    }));
}
