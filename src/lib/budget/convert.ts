import { BASE_CURRENCY } from "@/lib/currencies";

// Пересчёт введённой суммы в валюту хранения (USD, см. BASE_CURRENCY). Курсы /api/currency —
// «единиц валюты за 1 USD». Нет курса — null, а не «курс 1»: раньше `rates[code] || 1`
// молча записывал 1000 ¥ как $1000, пока курсы не загрузились.

export const roundCents = (v: number): number => Math.round(v * 100) / 100;

export function toBaseCurrency(amount: number, code: string, rates: Record<string, number> | undefined): number | null {
  if (!Number.isFinite(amount)) return null;
  if (code === BASE_CURRENCY) return roundCents(amount);
  const rate = rates?.[code];
  if (typeof rate !== "number" || !(rate > 0)) return null;
  return roundCents(amount / rate);
}
