import type { Photo } from "@/lib/types";

// Вставка только что загруженных кадров в кэш галереи. Ответ POST /api/photos — это уже
// готовая строка Photo, поэтому плитка появляется сразу после загрузки, не дожидаясь
// рефетча (а рефетч на каждый кадр — шторм из GET до 1000 фото с join'ами).

/** Ответ сервера похож на строку Photo (защита от пустого/обрезанного тела). */
export function isPhotoLike(x: unknown): x is Photo {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.url === "string" &&
    typeof p.dayId === "string" &&
    typeof p.takenAt === "string"
  );
}

/**
 * Подходит ли кадр под запись кэша ["photos", tripId, dayId?, placeId?]:
 * свежезагруженное фото без места попадает в общий список и в список своего дня.
 */
export function photosKeyAccepts(
  key: readonly unknown[],
  tripId: string,
  photo: Pick<Photo, "dayId">
): boolean {
  if (key[0] !== "photos" || key[1] !== tripId) return false;
  if (key[2] != null && key[2] !== photo.dayId) return false;
  if (key[3] != null) return false;
  return true;
}

/** Новые кадры в список (takenAt по убыванию, как отдаёт сервер); уже имеющиеся id не дублируются. */
export function mergePhotos(existing: readonly Photo[], incoming: readonly Photo[]): Photo[] {
  const have = new Set(existing.map((p) => p.id));
  const fresh = incoming.filter((p) => !have.has(p.id));
  if (!fresh.length) return existing as Photo[];
  return [...fresh, ...existing].sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt));
}
