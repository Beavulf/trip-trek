// Календарные даты «Сочтёмся» — строки ГГГГ-ММ-ДД без часового пояса («вчерашний чек» — это
// вчерашний день у того, кто его вносит, а не момент времени). В БД — тип DATE, наружу — ключ.

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, "0");

/** Ключ даты по ЛОКАЛЬНОМУ календарю устройства (клиент): «сегодня» у пользователя, а не по UTC. */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isDateKey(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = KEY_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Ключ → Date в полночь UTC (так Prisma пишет/читает тип DATE). */
export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Date из БД (полночь UTC) → ключ. */
export function dateToKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** «2026-10» из ключа даты. */
export const monthOf = (key: string): string => key.slice(0, 7);

/** Сдвиг месяца: addMonths("2026-12", 1) → "2027-01". */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/** Число суток между ключами (b − a), по календарю, без влияния перевода часов. */
export function diffDays(a: string, b: string): number {
  return Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / 86_400_000);
}

/** «Сегодня» / «Вчера» / «12 октября» (с годом, если не текущий). */
export function dayLabel(key: string, todayKey: string): string {
  const diff = diffDays(key, todayKey);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  const [y] = key.split("-").map(Number);
  const thisYear = Number(todayKey.slice(0, 4));
  return keyToDate(key).toLocaleDateString("ru-RU", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    ...(y !== thisYear ? { year: "numeric" } : {}),
  });
}

/** «Октябрь 2026» для переключателя месяцев. */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("ru-RU", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/\s*г\.$/, "");
}
