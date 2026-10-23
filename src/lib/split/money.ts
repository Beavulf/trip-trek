import { currencySymbol } from "@/lib/currencies";

// Деньги «Сочтёмся» — целые центы (Int в БД). Float остаётся только на границе с вводом
// пользователя: parseAmountToCents — единственное место, где строка «12,5» становится 1250.

/** Потолок одной суммы: 1 000 000.00 — как в тратах поездок, и с запасом влезает в INT4 (до 21 474 836.47). */
export const MAX_AMOUNT_CENTS = 100_000_000;

/** Центы из числа (округление до копейки). */
export const toCents = (amount: number): number => Math.round(amount * 100);

/** Число из центов — только для вывода/ввода; в расчётах не используется. */
export const fromCents = (cents: number): number => cents / 100;

/**
 * Ввод пользователя → центы. Принимает «12,5», «12.50», « 1 200 », число.
 * null — не число, отрицательное или больше потолка; 0 возвращается как 0 (решает вызывающий).
 */
export function parseAmountToCents(raw: unknown): number | null {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string") {
    const s = raw.replace(/[\s ]/g, "").replace(",", ".");
    if (!/^\d+(\.\d{0,2})?$/.test(s) && !/^\d*\.\d{1,2}$/.test(s)) return null;
    n = Number(s);
  } else return null;
  if (!Number.isFinite(n) || n < 0) return null;
  const cents = toCents(n);
  return cents > MAX_AMOUNT_CENTS ? null : cents;
}

const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(fractionDigits: 0 | 2): Intl.NumberFormat {
  const key = String(fractionDigits);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: fractionDigits, maximumFractionDigits: 2 });
    formatters.set(key, f);
  }
  return f;
}

/**
 * «1 200 Br», «12,50 Br». Копейки показываются только если они есть: в списке «45 Br» читается быстрее «45,00 Br».
 * Знак минус — настоящий «−» (U+2212): в тонком шрифте дефис путается с тире.
 */
export function formatCents(cents: number, currency: string, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const body = numberFormat(abs % 100 === 0 ? 0 : 2).format(abs / 100);
  const sym = currencySymbol(currency).trim();
  const sign = cents < 0 ? "−" : opts.sign && cents > 0 ? "+" : "";
  return `${sign}${body} ${sym}`;
}

/** Сумма для поля ввода: 1250 → «12,50», 1200 → «12» (запятая — как набирает русский пользователь). Обратное к parseAmountToCents. */
export function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",");
}

/** Процент в сотых долях для поля ввода: 6000 → «60», 3333 → «33,33». Парсится тем же parseAmountToCents. */
export const bpToInput = centsToInput;
