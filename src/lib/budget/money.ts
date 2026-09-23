// Копеечная (центовая) бухгалтерия долгов.
// Раньше доли трат считались float (100/3 = 33.3333…), и «Перевели» гасило округлённые
// 33.33 — хвост в треть копейки оставался в raw-суммах навсегда, копился и вылезал
// фантомным «должен $0.01», который нечем было гасить. Теперь все долги считаются
// в целых центах: нажатие «Перевели» закрывает пару ровно в ноль.

export const toCents = (amount: number): number => Math.round(amount * 100);

export const fromCents = (cents: number): number => cents / 100;

/**
 * Доли траты в центах на count частей: базовая доля каждому, остаток — первым
 * по порядку. Σ долей === toCents(amount), поэтому копейки не рождаются и не
 * теряются. Порядок участников детерминирован данными траты (splitWith из БД,
 * плательщик последним — см. expenseParticipants в balances.ts), так что все
 * клиенты раскладывают остаток одинаково.
 */
export function shareCents(amount: number, count: number): number[] {
  if (count <= 0) return [];
  const total = toCents(amount);
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}
