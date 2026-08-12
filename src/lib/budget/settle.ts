import type { Participant } from "@/lib/types";

// Алгоритм упрощения долгов (greedy)
// Старая версия settleDebts — используется в утилитах/тестах,
// в UI вместо неё используется calculateSettlements (см. balances.ts).
export function settleDebts(balances: { participant: Participant; paid: number; balance: number }[]) {
  const creditors = balances.filter((b) => b.balance > 0.01).sort((a, b) => b.balance - a.balance);
  const debtors = balances.filter((b) => b.balance < -0.01).sort((a, b) => a.balance - b.balance);
  const result: { from: Participant; to: Participant; amount: number }[] = [];
  let i = 0, j = 0;
  const c = creditors.map((x) => ({ ...x }));
  const d = debtors.map((x) => ({ ...x }));
  while (i < d.length && j < c.length) {
    const amt = Math.min(-d[i].balance, c[j].balance);
    result.push({ from: d[i].participant, to: c[j].participant, amount: amt });
    d[i].balance += amt;
    c[j].balance -= amt;
    if (Math.abs(d[i].balance) < 0.01) i++;
    if (Math.abs(c[j].balance) < 0.01) j++;
  }
  return result;
}
