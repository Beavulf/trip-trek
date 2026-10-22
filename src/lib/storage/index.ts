import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { UPLOADS_ROOT } from "./root";

// Единая политика загрузки файлов (локальный диск — решение владельца
// 2026-09-10, ADR-0003-amended: самодостаточный контейнер, без S3).
//
// Инварианты для ВСЕХ загрузок (фото, аватары, блюда):
//  - контент определяется магическими байтами, а не заголовком/именем;
//  - всё прогоняется через sharp: поворот по EXIF → ресайз → jpeg;
//  - ОРИГИНАЛ НИКОГДА не сохраняется как есть — повторное кодирование
//    выпиливает EXIF (включая GPS-координаты) и любое внедрённое содержимое;
//  - имя файла — crypto.randomUUID(), предсказать/подобрать нельзя;
//  - URL immutable (кэшируются год в static-uploads.ts).

export type StorageKind = "photo" | "avatar" | "food" | "feedback";

export interface PutInput {
  data: Buffer;
  kind: StorageKind;
}

export interface PutResult {
  /** Публичный URL файла */
  url: string;
  /** Миниатюра (только kind=photo) */
  thumbUrl?: string;
  /** Размеры сохранённого файла (после EXIF-поворота и ресайза, только kind=photo):
   *  из них клиент строит aspect-ratio плитки, не дожидаясь загрузки картинки */
  width?: number;
  height?: number;
}

/** Ошибка политики хранения: httpStatus мапится маршрутом как есть. */
export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "StorageError";
  }
}

const MAX_BYTES: Record<StorageKind, number> = {
  photo: 20 * 1024 * 1024,
  avatar: 5 * 1024 * 1024,
  food: 10 * 1024 * 1024,
  feedback: 5 * 1024 * 1024,
};

// Кап декодируемых пикселей: байтовый лимит не ловит «распаковочную бомбу» (небольшой
// JPEG с астрономическими размерами); 100 Mpx с запасом покрывает камеры телефонов
// (48 MP), но не 268 Mpx дефолта sharp
const MAX_INPUT_PIXELS = 100_000_000;

type SniffedType = "jpeg" | "png" | "webp" | "gif" | "heic" | "heif";

/** Определение формата по магическим байтам. */
function sniff(buf: Buffer): SniffedType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return "webp";
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return "gif";
  // ISO BMFF: ftyp-бокс на месте, бренд говорит HEIC/HEIF (iPhone)
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii").toLowerCase();
    if (brand.startsWith("hei")) return "heic";
    if (brand === "mif1" || brand === "msf1") return "heif";
  }
  return null;
}

/**
 * Миниатюра плитки галереи: 480px по длинной стороне. Единая политика для загрузки и
 * backfill-скрипта (prisma/backfill-photos.ts). rotate() для вторично обработанного
 * файла — no-op (EXIF уже выпилен), для старого оригинала — обязательный поворот.
 */
export async function makeThumb(source: Buffer | string): Promise<Buffer> {
  return sharp(source, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(480, 480, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
}

/**
 * Размеры картинки «как её видит человек». У sharp.metadata() width/height — до
 * EXIF-поворота: у кадров с ориентацией 5–8 (телефон в руке боком) стороны надо
 * поменять местами, иначе aspect-ratio плитки будет перевёрнутым.
 */
export async function imageDisplaySize(
  source: Buffer | string
): Promise<{ width: number; height: number } | null> {
  const m = await sharp(source, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  if (!m.width || !m.height) return null;
  return (m.orientation ?? 1) >= 5 ? { width: m.height, height: m.width } : { width: m.width, height: m.height };
}

async function toJpeg(
  data: Buffer,
  kind: StorageKind
): Promise<{ full: Buffer; thumb?: Buffer; width?: number; height?: number }> {
  let base;
  try {
    base = sharp(data, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS }).rotate(); // ориентация из EXIF
  } catch {
    throw new StorageError("Не удалось декодировать изображение", 415);
  }

  try {
    if (kind === "avatar") {
      const full = await base
        .resize(512, 512, { fit: "cover" })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
      return { full };
    }
    if (kind === "food") {
      const full = await base
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      return { full };
    }
    if (kind === "feedback") {
      // скриншоты баг-репортов: без миниатюры, скриншоты читаемы и в 1280px
      const full = await base
        .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
      return { full };
    }
    // photo: полноразмерная версия + миниатюра. info — размеры уже после поворота и
    // ресайза, отдельный decode ради metadata() не нужен
    const { data: full, info } = await base
      .clone()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    const thumb = await makeThumb(full);
    return { full, thumb, width: info.width, height: info.height };
  } catch (e) {
    // Чаще всего — HEIC, который не собирается с libheif в текущем sharp
    console.error(`[storage] sharp convert failed (kind=${kind}):`, e);
    throw new StorageError(
      "Не удалось обработать изображение (часто это HEIC). Сохраните как JPEG и попробуйте снова",
      415
    );
  }
}

/**
 * Сохранить файл по единой политике. Бросает StorageError (413/415).
 */
export async function put(input: PutInput): Promise<PutResult> {
  const { data, kind } = input;

  const type = sniff(data);
  if (!type) {
    throw new StorageError("Недопустимый тип файла", 415);
  }
  if (data.length > MAX_BYTES[kind]) {
    throw new StorageError(`Файл слишком большой (макс ${MAX_BYTES[kind] / 1024 / 1024}MB)`, 413);
  }

  const { full, thumb, width, height } = await toJpeg(data, kind);

  const root = UPLOADS_ROOT();
  const relDir = kind === "avatar" ? "avatars" : kind === "feedback" ? "feedback" : ".";
  const dir = relDir === "." ? root : path.join(root, relDir);
  await mkdir(dir, { recursive: true });

  const uuid = crypto.randomUUID();
  let fileName: string;
  let thumbName: string | undefined;
  if (kind === "photo") {
    fileName = `${uuid}.jpg`;
    thumbName = `${uuid}-thumb.jpg`;
  } else if (kind === "avatar") {
    fileName = `avatar-${uuid}.jpg`;
  } else if (kind === "feedback") {
    fileName = `feedback-${uuid}.jpg`;
  } else {
    fileName = `food-${uuid}.jpg`;
  }

  await writeFile(path.join(dir, fileName), full);
  if (thumb && thumbName) {
    await writeFile(path.join(dir, thumbName), thumb);
  }

  const urlPrefix = kind === "avatar" ? "/uploads/avatars" : kind === "feedback" ? "/uploads/feedback" : "/uploads";
  const result: PutResult = { url: `${urlPrefix}/${fileName}` };
  if (thumb && thumbName) result.thumbUrl = `${urlPrefix}/${thumbName}`;
  if (width && height) {
    result.width = width;
    result.height = height;
  }
  return result;
}

/**
 * Абсолютный путь файла по его публичному URL. Принимаются только /uploads/-пути;
 * единственное место защиты от path traversal — remove() и backfill ходят через него.
 */
export function uploadPath(url: string): string {
  if (typeof url !== "string" || !url.startsWith("/uploads/")) {
    throw new StorageError("Допустимы только файлы из /uploads/", 400);
  }
  const root = path.resolve(UPLOADS_ROOT());
  const target = path.resolve(root, url.slice("/uploads/".length));
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new StorageError("Путь вне хранилища", 400);
  }
  return target;
}

/**
 * Удалить файл по его публичному URL (см. uploadPath); отсутствующий файл — не ошибка.
 */
export async function remove(url: string): Promise<void> {
  const target = uploadPath(url);
  try {
    await unlink(target);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
