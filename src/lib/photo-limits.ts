// Лимит числа фото в одной поездке — защита диска общего VPS в бете. Размер файла ограничен
// отдельно (20 МБ, src/lib/storage), а общего количества раньше не было вовсе.
// Планка с запасом: самая большая живая поездка — ~900 кадров. Меняется переменной PHOTO_LIMIT_PER_TRIP.

const DEFAULT_LIMIT = 1500;

export function photoLimitPerTrip(): number {
  const n = Number(process.env.PHOTO_LIMIT_PER_TRIP);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_LIMIT;
}

/** Текст отказа, если в поездке уже набрался предел; иначе null. */
export function photoQuotaError(currentCount: number, limit = photoLimitPerTrip()): string | null {
  if (currentCount < limit) return null;
  return `В поездке уже ${currentCount} фото — это предел беты (${limit}). Удалите лишние снимки или напишите нам, если нужно больше.`;
}
