// Расчёт доли каждого участника в трате.
// splitUsers — список участников (БЕЗ плательщика), которые участвуют в трате
// paidById — id плательщика (зарезервирован для будущей поддержки взвешенных долей)
// excludeSelf = true  → плательщик не участвует (купил только для других)
//                    → доля = amount / splitUsers.length
// excludeSelf = false → плательщик тоже участвует (купил для себя + других)
//                    → доля = amount / (splitUsers.length + 1)
export function calculateSplit(
  amount: number,
  splitUsers: string[],
  paidById: string,
  excludeSelf: boolean,
): { perPerson: number; splitCount: number } {
  void paidById; // зарезервированный параметр — пока не используется
  const splitCount = excludeSelf ? splitUsers.length : splitUsers.length + 1;
  const perPerson = splitCount > 0 ? amount / splitCount : 0;
  return { perPerson, splitCount };
}
