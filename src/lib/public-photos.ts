import type { Prisma } from "@prisma/client";

// Порядок фото публичной страницы `/p/<token>`: по ходу поездки — день за днём,
// внутри дня от самого раннего кадра к позднему, чтобы листать «как всё шло».
// По одному `takenAt` нельзя: у фото без EXIF там время ЗАГРУЗКИ, и кадры дня 2,
// загруженные позже дня 5, уехали бы в конец. День — главный ключ, время — внутри дня.
// Первая партия (SSR) и порции `/p/<token>/photos` обязаны идти в одном порядке и
// продолжаться keyset-курсором ровно с того места, где закончилась предыдущая.

export const PUBLIC_PHOTO_ORDER: Prisma.PhotoOrderByWithRelationInput[] = [
  { day: { dayNumber: "asc" } },
  { takenAt: "asc" },
  { id: "asc" },
];

export interface PhotoPosition {
  dayNumber: number;
  takenAt: Date;
  id: string;
}

/** Курсор — непрозрачная строка «день~takenAt ISO~id»; «~» не встречается ни в ISO, ни в cuid */
export function encodePhotoCursor(p: PhotoPosition): string {
  return `${p.dayNumber}~${p.takenAt.toISOString()}~${p.id}`;
}

/** null — курсор кривой (чужой формат, мусор); сервер отвечает 400 */
export function decodePhotoCursor(raw: string): PhotoPosition | null {
  const first = raw.indexOf("~");
  const last = raw.lastIndexOf("~");
  if (first <= 0 || last <= first || last === raw.length - 1) return null;
  const dayNumber = Number(raw.slice(0, first));
  const takenAt = new Date(raw.slice(first + 1, last));
  if (!Number.isInteger(dayNumber) || Number.isNaN(takenAt.getTime())) return null;
  return { dayNumber, takenAt, id: raw.slice(last + 1) };
}

/** Фото СТРОГО после позиции в порядке PUBLIC_PHOTO_ORDER; не зависит от существования самой строки */
export function photosAfter(pos: PhotoPosition): Prisma.PhotoWhereInput {
  return {
    OR: [
      { day: { dayNumber: { gt: pos.dayNumber } } },
      { day: { dayNumber: pos.dayNumber }, takenAt: { gt: pos.takenAt } },
      { day: { dayNumber: pos.dayNumber }, takenAt: pos.takenAt, id: { gt: pos.id } },
    ],
  };
}
