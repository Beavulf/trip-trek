import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Короткая вибрация на мобильных (безопасно игнорируется, где не поддерживается) */
export function haptic(ms = 8) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      // ignore
    }
  }
}

/** Русская форма слова по числу: plural(21, "день", "дня", "дней") → "день" */
export function plural(n: number, one: string, few: string, many: string) {
  const abs = Math.abs(Math.trunc(n))
  if (abs % 10 === 1 && abs % 100 !== 11) return one
  if ([2, 3, 4].includes(abs % 10) && ![12, 13, 14].includes(abs % 100)) return few
  return many
}

/** Координаты для показа человеку: «23.1291, 113.2644» (4 знака) */
export function formatLatLng(lat: number, lng: number, sep = ", ") {
  return `${lat.toFixed(4)}${sep}${lng.toFixed(4)}`;
}

/**
 * Деньги для показа: максимум 2 знака после точки, лишние нули срезаются
 * (5000 → «5000», 5814.8234 → «5814.82», 100/3 → «33.33»).
 * Сырые float из БД в текст рисовать нельзя — бывали хвосты на 6–8 знаков.
 */
export function fmtMoney(v: number) {
  return String(Number(v.toFixed(2)));
}

/** Стабильный ключ пары координат (дедупликация геокода, query-ключи) */
export function coordKey(lat: number, lng: number) {
  return formatLatLng(lat, lng, "-");
}
