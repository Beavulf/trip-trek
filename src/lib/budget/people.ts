import type { Expense, Participant } from "@/lib/types";

// «Участники денег» поездки — тот, кого считает расчёт долгов, «Бюджет каждого» и «Моё».
// Раньше расчёт брал только текущих участников, и всё, что связано с ушедшим человеком
// (его траты, его доли в чужих тратах), молча выпадало: долг в 30$ исчезал, а у заплатившего
// за двоих пропадала чужая доля. Теперь в расчёте участвуют:
//  - активные участники, КРОМЕ зрителей (зритель — read-only друг вне денег);
//  - зритель, если он уже фигурирует в тратах (роль сменили позже) — его долги не теряем;
//  - бывшие участники, чьи id остались в тратах, с пометкой former.

/** id пользователей, упомянутых в тратах: плательщики и участники деления. */
export function expenseUserIds(expenses: Pick<Expense, "paidById" | "splitWith">[]): Set<string> {
  const ids = new Set<string>();
  for (const e of expenses) {
    if (e.paidById) ids.add(e.paidById);
    for (const id of (e.splitWith || "").split(",")) if (id) ids.add(id);
  }
  return ids;
}

/** Заглушка для id, которого нет ни среди активных, ни среди бывших (данные ещё не доехали). */
function unknownPerson(id: string): Participant {
  return { id, name: "Бывший участник", color: "#94a3b8", emoji: "👤", role: null, budget: null, former: true };
}

export function moneyParticipants(
  active: Participant[],
  former: Participant[] | undefined,
  expenses: Pick<Expense, "paidById" | "splitWith">[]
): Participant[] {
  const involved = expenseUserIds(expenses);
  const result: Participant[] = [];
  const seen = new Set<string>();

  for (const p of active) {
    if (p.role === "viewer" && !involved.has(p.id)) continue;
    result.push(p);
    seen.add(p.id);
  }
  for (const f of former ?? []) {
    if (seen.has(f.id) || !involved.has(f.id)) continue;
    result.push({ ...f, former: true });
    seen.add(f.id);
  }
  // Страховка от рассинхрона: id есть в тратах, но ни в одном списке — не теряем долг молча
  for (const id of involved) {
    if (!seen.has(id)) result.push(unknownPerson(id));
  }
  return result;
}

/** Кого можно выбрать плательщиком/участником новой траты: активные не-зрители. */
export function expenseSelectableParticipants(participants: Participant[]): Participant[] {
  return participants.filter((p) => p.role !== "viewer");
}
