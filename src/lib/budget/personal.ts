import type { Expense } from "@/lib/types";
import { sharePerPerson } from "./balances";

export interface PersonalSpend {
  /** Сумма по категориям: category → деньги */
  byCategory: Record<string, number>;
  /** Сумма по дням: dayId → деньги (траты без дня не попадают) */
  byDay: Record<string, number>;
  total: number;
}

const sumRemaining = (ledger: { remaining: number }[] | undefined) =>
  (ledger ?? []).reduce((s, c) => s + c.remaining, 0);

// Гасим `amount` долга debtor перед creditor: зачтённая доля каждой исходной траты
// переходит от кредитора (он платил, но ему вернули/зачли) к должнику (по факту потратил он).
// Внутри книги берём пропорционально остаткам, чтобы категории гасились равномерно.
function offsetClaims(
  claims: Record<string, Record<string, { category: string; dayId: string | null; remaining: number }[]>>,
  result: Record<string, PersonalSpend>,
  debtor: string,
  creditor: string,
  amount: number
) {
  const ledger = claims[debtor]?.[creditor] ?? [];
  const gross = sumRemaining(ledger);
  if (gross <= 1e-9) return;
  for (const c of ledger) {
    const t = amount * (c.remaining / gross);
    if (t <= 0) continue;
    c.remaining -= t;
    const pCred = result[creditor];
    const pDeb = result[debtor];
    pCred.byCategory[c.category] = (pCred.byCategory[c.category] ?? 0) - t;
    if (c.dayId) pCred.byDay[c.dayId] = (pCred.byDay[c.dayId] ?? 0) - t;
    pCred.total -= t;
    pDeb.byCategory[c.category] = (pDeb.byCategory[c.category] ?? 0) + t;
    if (c.dayId) pDeb.byDay[c.dayId] = (pDeb.byDay[c.dayId] ?? 0) + t;
    pDeb.total += t;
  }
}

// Персональные траты «по реальным деньгам» — сколько человек фактически потратил из кошелька:
//  1) любая трата сначала целиком у плательщика (заплатил за троих $200 — у него все $200, долги — отдельная история);
//  2) перевод (settlement) должник → кредитор переносит часть траты от кредитора к должнику —
//     в тех же категориях и днях, где возник погашаемый долг (жадно по долговой книге, в хронологии переводов);
//  3) когда все долги закрыты, у каждого остаётся ровно его доля потребления — модель сходится к «честным долям».
// Сумма total по всем участникам всегда равна сумме не-settlement трат (консервация), см. тесты.
export function calculatePersonalSpend(expenses: Expense[], userIds: string[]): Record<string, PersonalSpend> {
  const result: Record<string, PersonalSpend> = {};
  const spend = (id: string, category: string, dayId: string | null, v: number) => {
    const p = (result[id] ??= { byCategory: {}, byDay: {}, total: 0 });
    p.byCategory[category] = (p.byCategory[category] ?? 0) + v;
    if (dayId) p.byDay[dayId] = (p.byDay[dayId] ?? 0) + v;
    p.total += v;
  };

  for (const id of userIds) result[id] ??= { byCategory: {}, byDay: {}, total: 0 };

  // Долговая книга: claims[должник][кредитор] — доли общих трат, которые должник ещё не вернул кредитору.
  // Каждая запись помнит категорию и день исходной траты — по ним перевод «переедет» к должнику.
  const claims: Record<string, Record<string, { category: string; dayId: string | null; remaining: number }[]>> = {};

  const settlements: Expense[] = [];

  for (const e of expenses) {
    if (e.category === "settlement") {
      settlements.push(e);
      continue;
    }
    // Трата целиком у плательщика — деньги ведь вышли из его кошелька
    if (result[e.paidById]) spend(e.paidById, e.category, e.dayId, e.amount);
    const splitUsers: string[] = (e.splitWith || "").split(",").filter(Boolean);
    if (splitUsers.length === 0) continue; // личная трата — долгов не создаёт
    const participants = e.excludeSelf ? splitUsers : [...splitUsers, e.paidById];
    for (const debtor of participants) {
      if (debtor === e.paidById) continue;
      const share = sharePerPerson(e);
      ((claims[debtor] ??= {})[e.paidById] ??= []).push({
        category: e.category,
        dayId: e.dayId,
        remaining: share,
      });
    }
  }

  // Взаимозачёт (живой, без кнопки): встречные долги пары гасят друг друга —
  // «он заплатил за меня» компенсирует «я заплатил за него» (если он платил за себя и меня —
  // компенсирует только моя доля). Зачтённая доля переходит от кредитора к должнику
  // (это его потребление) в категориях/днях исходных трат. Нетто-остаток долга ждёт перевода.
  const seenPairs = new Set<string>();
  for (const debtor of Object.keys(claims)) {
    for (const creditor of Object.keys(claims[debtor])) {
      const key = debtor < creditor ? `${debtor}|${creditor}` : `${creditor}|${debtor}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const grossX = sumRemaining(claims[debtor]?.[creditor]);
      const grossY = sumRemaining(claims[creditor]?.[debtor]);
      const offset = Math.min(grossX, grossY);
      if (offset <= 1e-9) continue;
      offsetClaims(claims, result, debtor, creditor, offset);
      offsetClaims(claims, result, creditor, debtor, offset);
    }
  }

  // Переводы гасим в хронологическом порядке — так история перетеканий воспроизводима
  settlements.sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));

  for (const s of settlements) {
    const recipients: string[] = (s.splitWith || "").split(",").filter(Boolean);
    if (recipients.length === 0) continue;
    const per = s.amount / recipients.length;
    for (const creditor of recipients) {
      const debtor = s.paidById;
      if (debtor === creditor || !result[creditor] || !result[debtor]) continue;
      let left = per;
      // Гасим долг должника перед кредитором: у кредитора трата уменьшается (деньги вернулись),
      // у должника — появляется (по факту потратил он), в категории/дне исходной траты.
      for (const c of claims[debtor]?.[creditor] ?? []) {
        if (left <= 1e-9) break;
        if (c.remaining <= 1e-9) continue;
        const t = Math.min(left, c.remaining);
        c.remaining -= t;
        left -= t;
        spend(creditor, c.category, c.dayId, -t);
        spend(debtor, c.category, c.dayId, t);
      }
      // Перевод без подходящих долгов (адхок/перевыплата) — распределяем пропорционально
      // текущим тратам кредитора, чтобы суммы по категориям у обоих сошлись.
      if (left > 1e-9) {
        const cats = Object.keys(result[creditor].byCategory).filter((c) => result[creditor].byCategory[c] > 0);
        const base = cats.reduce((sum, c) => sum + result[creditor].byCategory[c], 0);
        for (const c of cats) {
          const t = base > 0 ? left * (result[creditor].byCategory[c] / base) : 0;
          if (t <= 0) continue;
          spend(creditor, c, null, -t);
          spend(debtor, c, null, t);
        }
      }
    }
  }

  return result;
}
