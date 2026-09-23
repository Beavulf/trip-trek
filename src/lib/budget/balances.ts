import type { Expense, Participant } from "@/lib/types";
import { fromCents, shareCents, toCents } from "./money";

export interface Balance {
  participant: Participant;
  paid: number;
  balance: number;
  owedToMe: number;
  owedToOthers: number;
}

export interface Settlement {
  from: Participant;
  to: Participant;
  amount: number;
}

// === НОВАЯ ЛОГИКА ДОЛГОВ ===
// Личные траты (splitWith пустой) — НЕ создают долгов, просто учитываются в статистике
// Траты с splitWith — создают долги: каждый в splitWith должен плательщику свою долю
// excludeSelf = true → плательщик не участвует (купил только для других)
// excludeSelf = false → плательщик тоже участвует (купил для себя + других)
// Все долговые суммы — в целых центах (см. money.ts): доли-«трети» в float оставляли
// неуязвимые хвосты «должен $0.01» после каждого перевода.

// Доля одного участника в трате (float-вариант для персональной аналитики personal.ts,
// которая допускает дроби; долги и балансы считают shareCents)
export function sharePerPerson(e: Expense): number {
  const splitUsers: string[] = (e.splitWith || "").split(",").filter(Boolean);
  if (splitUsers.length === 0) return 0;
  const count = e.excludeSelf ? splitUsers.length : splitUsers.length + 1;
  return e.amount / count;
}

// Участники траты в детерминированном порядке: splitWith как в БД, плательщик последним
// (когда участвует). От порядка зависит, кому достанется лишняя копейка остатка —
// поэтому все потребители долгов обязаны брать участников только отсюда.
export function expenseParticipants(e: Expense): string[] {
  const splitUsers: string[] = (e.splitWith || "").split(",").filter(Boolean);
  return e.excludeSelf ? splitUsers : [...splitUsers, e.paidById];
}

// Доли долгов траты в центах: кто (кроме плательщика) и сколько должен.
// Переводы (settlement) участвуют наравне — встречный долг кредитора гасит исходный,
// это и есть механизм неттинга пары.
function debtorShares(e: Expense): { debtorId: string; cents: number }[] {
  const participants = expenseParticipants(e);
  const shares = shareCents(e.amount, participants.length);
  return participants
    .map((debtorId, i) => ({ debtorId, cents: shares[i] }))
    .filter((s) => s.debtorId !== e.paidById);
}

// Считаем paid (сколько каждый реально заплатил, без settlement)
// и долги (кто кому сколько должен)
export function calculateBalances(expenses: Expense[], participants: Participant[]): Balance[] {
  if (participants.length === 0) return [];
  const paidCents: Record<string, number> = {};
  const owedToMeCents: Record<string, number> = {};
  const owedToOthersCents: Record<string, number> = {};
  for (const p of participants) {
    paidCents[p.id] = 0;
    owedToMeCents[p.id] = 0;
    owedToOthersCents[p.id] = 0;
  }

  for (const e of expenses) {
    if (!(e.paidById in paidCents)) continue;
    if (e.category !== "settlement") paidCents[e.paidById] += toCents(e.amount);
    for (const { debtorId, cents } of debtorShares(e)) {
      if (!(debtorId in owedToOthersCents)) continue;
      owedToOthersCents[debtorId] += cents;
      owedToMeCents[e.paidById] += cents;
    }
  }

  return participants.map((p) => {
    const paid = fromCents(paidCents[p.id]);
    const owedToMe = fromCents(owedToMeCents[p.id]);
    const owedToOthers = fromCents(owedToOthersCents[p.id]);
    // Баланс: + значит мне должны, - значит я должен
    const balance = owedToMe - owedToOthers;
    return { participant: p, paid, balance, owedToMe, owedToOthers };
  });
}

// Чистые траты каждого («Бюджет каждого») — сколько денег ушло из кошелька человека
// с учётом переводов: реальные траты + переводы, которые он отправил, − доли переводов,
// которые ему вернули. Сумма по всем всегда равна сумме реальных трат поездки.
export function calculateNetSpent(expenses: Expense[], participants: Participant[]): Record<string, number> {
  const spentCents: Record<string, number> = {};
  participants.forEach((p) => { spentCents[p.id] = 0; });
  expenses.forEach((e) => {
    if (!(e.paidById in spentCents)) return;
    spentCents[e.paidById] += toCents(e.amount);
    if (e.category !== "settlement") return;
    // Перевод: paidById отправил деньги тем, кто в splitWith — у них чистая трата уменьшается
    const recipients: string[] = (e.splitWith || "").split(",").filter(Boolean);
    const shares = shareCents(e.amount, recipients.length);
    recipients.forEach((id, i) => {
      if (id in spentCents) spentCents[id] -= shares[i];
    });
  });
  return Object.fromEntries(
    participants.map((p) => [p.id, fromCents(spentCents[p.id])])
  );
}

// Расчёт кто кому конкретно должен (per-person debts)
// Упрощаем: если A должен B $X и B должен A $Y → net = X - Y
export function calculateSettlements(expenses: Expense[], participants: Participant[]): Settlement[] {
  if (participants.length === 0) return [];
  const debtsCents: Record<string, Record<string, number>> = {};
  expenses
    .filter((e) => e.splitWith && e.splitWith?.length > 0)
    .forEach((e) => {
      for (const { debtorId, cents } of debtorShares(e)) {
        (debtsCents[debtorId] ??= {})[e.paidById] = (debtsCents[debtorId]?.[e.paidById] ?? 0) + cents;
      }
    });

  const settlements: Settlement[] = [];
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i].id;
      const b = participants[j].id;
      const aToB = debtsCents[a]?.[b] ?? 0; // A должен B
      const bToA = debtsCents[b]?.[a] ?? 0; // B должен A
      const net = aToB - bToA;
      // Центы уже точные: перевод ровно по показанной сумме гасит пару в ноль,
      // никаких хвостов и повторных фантомных долгов
      if (net > 0) {
        settlements.push({ from: participants[i], to: participants[j], amount: fromCents(net) });
      } else if (net < 0) {
        settlements.push({ from: participants[j], to: participants[i], amount: fromCents(-net) });
      }
    }
  }
  // Сортируем по убыванию суммы
  settlements.sort((a, b) => b.amount - a.amount);
  return settlements;
}
