import type { Expense, Participant } from "@/lib/types";

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

// Считаем paid (сколько каждый реально заплатил, без settlement)
// и долги (кто кому сколько должен)
export function calculateBalances(expenses: Expense[], participants: Participant[]): Balance[] {
  if (participants.length === 0) return [];
  return participants.map((p) => {
    // Сколько реально заплатил (все траты кроме settlement)
    const paid = expenses
      .filter((e) => e.paidById === p.id && e.category !== "settlement")
      .reduce((s, e) => s + e.amount, 0);

    // Сколько мне должны (я плательщик в split-тратах)
    let owedToMe = 0;
    expenses
      .filter((e) => e.paidById === p.id && e.splitWith && e.splitWith?.length > 0)
      .forEach((e) => {
        const splitUsers: string[] = (e.splitWith || "").split(",").filter(Boolean);
        if (splitUsers.length === 0) return;
        const perPerson = e.excludeSelf
          ? e.amount / splitUsers.length
          : e.amount / (splitUsers.length + 1);
        owedToMe += perPerson * splitUsers.length;
      });

    // Сколько я должен другим (я в splitWith чужих трат)
    let owedToOthers = 0;
    expenses
      .filter((e) => e.paidById !== p.id && e.splitWith && e.splitWith?.length > 0)
      .forEach((e) => {
        const splitUsers: string[] = (e.splitWith || "").split(",").filter(Boolean);
        if (!splitUsers.includes(p.id)) return;
        const perPerson = e.excludeSelf
          ? e.amount / splitUsers.length
          : e.amount / (splitUsers.length + 1);
        owedToOthers += perPerson;
      });

    // Баланс: + значит мне должны, - значит я должен
    const balance = owedToMe - owedToOthers;
    return { participant: p, paid, balance, owedToMe, owedToOthers };
  });
}

// Расчёт кто кому конкретно должен (per-person debts)
// Упрощаем: если A должен B $X и B должен A $Y → net = X - Y
export function calculateSettlements(expenses: Expense[], participants: Participant[]): Settlement[] {
  if (participants.length === 0) return [];
  const debtsMap: Record<string, Record<string, number>> = {};
  expenses
    .filter((e) => e.splitWith && e.splitWith?.length > 0)
    .forEach((e) => {
      const splitUsers: string[] = (e.splitWith || "").split(",").filter(Boolean);
      if (splitUsers.length === 0) return;
      const perPerson = e.excludeSelf
        ? e.amount / splitUsers.length
        : e.amount / (splitUsers.length + 1);
      splitUsers.forEach((userId) => {
        if (!debtsMap[userId]) debtsMap[userId] = {};
        debtsMap[userId][e.paidById] = (debtsMap[userId][e.paidById] || 0) + perPerson;
      });
    });

  const settlements: Settlement[] = [];
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i].id;
      const b = participants[j].id;
      const aToB = debtsMap[a]?.[b] || 0; // A должен B
      const bToA = debtsMap[b]?.[a] || 0; // B должен A
      const net = aToB - bToA;
      if (net > 0.01) {
        settlements.push({ from: participants[i], to: participants[j], amount: Math.round(net * 100) / 100 });
      } else if (net < -0.01) {
        settlements.push({ from: participants[j], to: participants[i], amount: Math.round(-net * 100) / 100 });
      }
    }
  }
  // Сортируем по убыванию суммы
  settlements.sort((a, b) => b.amount - a.amount);
  return settlements;
}
