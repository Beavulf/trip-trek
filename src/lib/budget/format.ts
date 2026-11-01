// Формат денег вкладки «Бюджет». Правило одно на всю страницу: итоги и сводки — целыми,
// копейки — только там, где сумму переводят или сверяют (долги, строки трат).
// Раньше рядом стояли $6743, $5814.82, $-254.15 и −$0.74: число читалось по-разному в каждом блоке.

const WHOLE = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const EXACT = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Настоящий минус, а не дефис: дефис в цифрах с tabular-nums читается как тире
const MINUS = "−";

/** Округление до копеек заранее: иначе −0.001 превращается в «−$0,00» */
const cents = (v: number) => Math.round(v * 100);

function render(sym: string, v: number, fmt: Intl.NumberFormat, plus: boolean, scale: number): string {
  const rounded = Math.round(v * scale) / scale;
  const sign = rounded < 0 ? MINUS : plus && rounded > 0 ? "+" : "";
  return `${sign}${sym}${fmt.format(Math.abs(rounded))}`;
}

/** Сводка: `$6 743`, `−$254` */
export function moneyWhole(sym: string, v: number): string {
  return render(sym, v, WHOLE, false, 1);
}

/** Точная сумма: `$1 984,08`, `$0,74` */
export function moneyExact(sym: string, v: number): string {
  return render(sym, cents(v) / 100, EXACT, false, 100);
}

/** Разница со знаком: `+$0,74`, `−$0,74`; ноль — без знака */
export function moneyDelta(sym: string, v: number): string {
  return render(sym, cents(v) / 100, EXACT, true, 100);
}
