import type { Prisma } from "@prisma/client";

// Правила публичной ссылки поездки `/p/<token>`: включена ли она сейчас и до какого срока.
// Страница, порции фото, ZIP и сердечко обязаны открываться по ОДНОМУ условию — иначе
// истёкшая ссылка продолжит отдавать, например, архив фото.

/** Срок действия, который владелец может выбрать в «Поделиться»; null — бессрочно */
export const SHARE_EXPIRY_DAYS = [1, 7, 30, 90] as const;
export type ShareExpiryDays = (typeof SHARE_EXPIRY_DAYS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Истекла ли ссылка к моменту now; null — бессрочная */
export function isShareExpired(expiresAt: Date | null | undefined, now = new Date()): boolean {
  return !!expiresAt && expiresAt.getTime() <= now.getTime();
}

/** Конец срока через N суток от now */
export function shareExpiryFromDays(days: number, now = new Date()): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/**
 * Разбор `expiresInDays` из тела запроса владельца: число суток из списка → оно,
 * null → снять срок, остальное → undefined (поле не передано/мусор, ответ 400 решает роут).
 */
export function parseExpiryDays(value: unknown): ShareExpiryDays | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && (SHARE_EXPIRY_DAYS as readonly number[]).includes(value)) {
    return value as ShareExpiryDays;
  }
  return undefined;
}

/** Где искать поездку для гостя: ссылка включена и срок не вышел */
export function activeShareWhere(token: string, now = new Date()): Prisma.TripWhereInput {
  return {
    shareToken: token,
    shareEnabled: true,
    OR: [{ shareExpiresAt: null }, { shareExpiresAt: { gt: now } }],
  };
}

/** Фото, которые видно гостю (владелец может скрыть отдельные кадры) */
export const PUBLIC_PHOTO_WHERE = { hiddenFromPublic: false } satisfies Prisma.PhotoWhereInput;
