// Долги группы «Сочтёмся». Чистые функции над центами; ссылаются на SplitMember.id.
// Логика неттинга — та же, что в бюджете поездок (попарно: «A должен B» минус «B должен A»),
// но доли берутся готовыми из SplitShare (любое деление), а перевод — отдельная сущность.

export interface LedgerExpense {
  amountCents: number;
  paidById: string;
  shares: { memberId: string; cents: number }[];
}

export interface LedgerPayment {
  fromId: string;
  toId: string;
  amountCents: number;
}

export interface Debt {
  /** Должник */
  fromId: string;
  /** Кому должен */
  toId: string;
  cents: number;
}

/**
 * Итоговый баланс каждого: «+» — ему должны, «−» — он должен. Сумма по всем всегда 0.
 * paid − доли + отданные переводы − полученные.
 */
export function memberBalances(expenses: LedgerExpense[], payments: LedgerPayment[]): Map<string, number> {
  const balance = new Map<string, number>();
  const add = (id: string, delta: number) => balance.set(id, (balance.get(id) ?? 0) + delta);
  for (const e of expenses) {
    add(e.paidById, e.amountCents);
    for (const s of e.shares) add(s.memberId, -s.cents);
  }
  for (const p of payments) {
    add(p.fromId, p.amountCents);
    add(p.toId, -p.amountCents);
  }
  return balance;
}

/** Ключ неупорядоченной пары: a|b, где a < b. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Попарные долги после неттинга встречных: для каждой пары не больше одной записи.
 * Доля плательщика самому себе долга не создаёт. Перевод X→Y уменьшает долг X перед Y
 * (а если больше долга — Y становится должен X).
 */
export function pairDebts(expenses: LedgerExpense[], payments: LedgerPayment[]): Debt[] {
  // net[a|b] > 0 — меньший id должен большему; знак привязан к порядку ключа, иначе пришлось бы хранить две стороны
  const net = new Map<string, number>();
  const owe = (debtor: string, creditor: string, cents: number) => {
    if (debtor === creditor || cents === 0) return;
    const key = pairKey(debtor, creditor);
    const sign = debtor < creditor ? 1 : -1;
    net.set(key, (net.get(key) ?? 0) + sign * cents);
  };
  for (const e of expenses) {
    for (const s of e.shares) owe(s.memberId, e.paidById, s.cents);
  }
  for (const p of payments) owe(p.fromId, p.toId, -p.amountCents);

  const debts: Debt[] = [];
  for (const [key, value] of net) {
    if (value === 0) continue;
    const [lo, hi] = key.split("|");
    debts.push(value > 0 ? { fromId: lo, toId: hi, cents: value } : { fromId: hi, toId: lo, cents: -value });
  }
  // Крупные сверху; при равных суммах порядок детерминирован — списки не прыгают между рендерами
  return debts.sort((a, b) => b.cents - a.cents || a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId));
}

/** Сколько центов `fromId` должен `toId` с учётом встречных. Отрицательное — должен `toId`. */
export function pairNet(expenses: LedgerExpense[], payments: LedgerPayment[], fromId: string, toId: string): number {
  for (const d of pairDebts(expenses, payments)) {
    if (d.fromId === fromId && d.toId === toId) return d.cents;
    if (d.fromId === toId && d.toId === fromId) return -d.cents;
  }
  return 0;
}

/** Мои итоги по долгам: сколько я должен всего и сколько должны мне (по попарным долгам). */
export function myTotals(debts: Debt[], myId: string): { owe: number; owed: number } {
  let owe = 0;
  let owed = 0;
  for (const d of debts) {
    if (d.fromId === myId) owe += d.cents;
    else if (d.toId === myId) owed += d.cents;
  }
  return { owe, owed };
}
