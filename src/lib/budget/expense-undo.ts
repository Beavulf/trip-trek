// Undo удаления траты: пересборка POST-полезной нагрузки из DTO кэша.
// DTO хранит splitWith строкой («u1,u2»), POST ждёт массив; служебные поля
// (id/paidBy/day/createdAt) в восстановление не идут. Переводу нужен
// settlementKey с префиксом settle- (expense-input.ts:96) — генерируем новый:
// старая запись удалена, ключ свободен, а свежий суффикс защищает от коллизий.
import type { Expense } from "@/lib/types";

export interface ExpenseRestorePayload {
  tripId: string;
  amount: number;
  category: string;
  description: string;
  paidById: string;
  dayId?: string;
  splitWith: string[];
  excludeSelf?: boolean;
  originalAmount?: number;
  originalCurrency?: string;
  settlementKey?: string;
}

export function expenseRestorePayload(removed: Expense, tripId: string, keySuffix: string): ExpenseRestorePayload {
  return {
    tripId,
    amount: removed.amount,
    category: removed.category,
    description: removed.description,
    paidById: removed.paidById,
    dayId: removed.dayId ?? undefined,
    splitWith: (removed.splitWith ?? "").split(",").filter(Boolean),
    excludeSelf: removed.excludeSelf,
    originalAmount: removed.originalAmount ?? undefined,
    originalCurrency: removed.originalCurrency ?? undefined,
    settlementKey: removed.category === "settlement" ? `settle-undo-${keySuffix}` : undefined,
  };
}
