// Пересчёт сумм между валютами для «Сочтёмся». Курсы — те же, что отдаёт /api/currency: «единиц валюты за 1 USD».
// Чистые функции (тесты рядом). Нет курса — null, а не «курс 1»: иначе 1000 ¥ молча записались бы как 1000 Br
// (та же защита, что в lib/budget/convert.ts для поездок).

export type Rates = Record<string, number>;

function rateToUsd(code: string, rates: Rates | null | undefined): number | null {
  if (code === "USD") return 1;
  const r = rates?.[code];
  return typeof r === "number" && r > 0 ? r : null;
}

/** Сколько единиц `to` в одной единице `from`: exchangeRate("USD", "BYN", rates) ≈ 3,2. */
export function exchangeRate(from: string, to: string, rates: Rates | null | undefined): number | null {
  if (from === to) return 1;
  const rf = rateToUsd(from, rates);
  const rt = rateToUsd(to, rates);
  return rf === null || rt === null ? null : rt / rf;
}

/** Центы одной валюты → центы другой (округление до копейки). null — курса нет. */
export function convertCents(cents: number, from: string, to: string, rates: Rates | null | undefined): number | null {
  if (!Number.isFinite(cents)) return null;
  const rate = exchangeRate(from, to, rates);
  return rate === null ? null : Math.round(cents * rate);
}

/** «3,2250», «0,0108», «92,00»: четыре знака у мелких курсов, два у крупных — читаемо и без лишнего шума. */
export function formatRate(rate: number): string {
  const digits = rate >= 10 ? 2 : 4;
  return rate.toFixed(digits).replace(".", ",");
}
