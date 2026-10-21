// Чтение EXIF из фото на клиенте — ДО загрузки: сервер выпиливает EXIF при
// sharp-обработке (политика storage), поэтому GPS и дата съёмки добываются
// только здесь. Ретро-кейс 2026-10 (поездка в Китай): вечерние батчи из
// галереи несли гео отеля (геометки камеры выключены), а дата съёмки в EXIF
// была всегда — на ней строится автокладка фото по дням маршрута.

export interface PhotoExif {
  coords?: { lat: number; lng: number };
  takenAt?: Date;
}

/** EXIF-дата 'YYYY:MM:DD HH:MM:SS' → Date в локальном времени камеры. */
export function parseExifDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6])
  );
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * DMS → десятичные градусы. exifr.parse() отдаёт GPS тегами-массивами
 * [градусы, минуты, секунды] (короткие массивы тоже валидны), а отдельный
 * пресет exifr.gps() — уже числом; раньше здесь терялись все координаты
 * (Number([43,28,2.8]) → NaN → null).
 */
function dmsToDegrees(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value) && value.length > 0) {
    const [d = 0, m = 0, s = 0] = value;
    if ([d, m, s].some((x) => typeof x !== "number" || !Number.isFinite(x))) return null;
    return d + m / 60 + s / 3600;
  }
  return null;
}

/**
 * Нормализация GPS-тегов: DMS/десятичные градусы + знак по полушарию
 * (S/W → минус). Валидируем диапазон — мусорные теги не должны попадать в БД.
 */
export function normalizeExifGps(
  lat: unknown,
  latRef: unknown,
  lng: unknown,
  lngRef: unknown
): { lat: number; lng: number } | null {
  const la = dmsToDegrees(lat);
  const ln = dmsToDegrees(lng);
  if (la === null || ln === null) return null;
  const signLat = String(latRef ?? "N").toUpperCase().startsWith("S") ? -1 : 1;
  const signLng = String(lngRef ?? "E").toUpperCase().startsWith("W") ? -1 : 1;
  const out = { lat: la * signLat, lng: ln * signLng };
  if (Math.abs(out.lat) > 90 || Math.abs(out.lng) > 180) return null;
  return out;
}

/**
 * Один проход exifr по файлу: GPS + дата съёмки. Блоки кроме EXIF/GPS/TIFF
 * выключены — на батче из 50 фото парсинг не должен занимать секунды.
 * Любая неудача → null: EXIF опционален, форма падать не должна.
 */
export async function readPhotoExif(file: File): Promise<PhotoExif | null> {
  try {
    const exifr = (await import("exifr")).default;
    const tags = (await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      iptc: false,
      xmp: false,
      icc: false,
      jfif: false,
      ihdr: false,
    })) as Record<string, unknown> | null | undefined;
    if (!tags) return null;
    const coords = normalizeExifGps(
      tags.GPSLatitude, tags.GPSLatitudeRef, tags.GPSLongitude, tags.GPSLongitudeRef
    );
    const takenAt =
      parseExifDate(tags.DateTimeOriginal) ?? parseExifDate(tags.DateTime);
    if (!coords && !takenAt) return null;
    return { coords: coords ?? undefined, takenAt: takenAt ?? undefined };
  } catch {
    // битый/нестандартный EXIF — обычное дело, тишину считаем нормой
    return null;
  }
}
