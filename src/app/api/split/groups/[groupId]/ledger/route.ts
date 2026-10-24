import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireGroupMember, SPLIT_LIMITS } from "@/lib/split/access";
import { materializeRecurring } from "@/lib/split/recurring-run";
import { EXPENSE_INCLUDE, expenseDTO, paymentDTO, recurringDTO } from "@/lib/split/serialize";
import { requestToday } from "@/lib/split/server";
import type { SplitLedgerDTO } from "@/lib/split/types";

type Ctx = { params: Promise<{ groupId: string }> };

// GET /api/split/groups/[groupId]/ledger?today=ГГГГ-ММ-ДД — траты, переводы и шаблоны группы одним ответом.
// Баланс считает клиент (lib/split/balances): расчёт идёт по ВСЕМ тратам, обрезка по лимиту искажала бы долги,
// поэтому take — только страховка от аварийного размера (SPLIT_LIMITS.expensesPerGroup запрещает рост дальше).
// Перед чтением создаём недостающие повторяющиеся траты (ленивая материализация, ADR-0009).
export async function GET(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params;
  const { response } = await requireGroupMember(req, groupId);
  if (response) return response;

  await materializeRecurring(groupId, requestToday(req));

  const [expenses, payments, recurrings, reminders] = await Promise.all([
    db.splitExpense.findMany({
      where: { groupId },
      include: EXPENSE_INCLUDE,
      orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
      take: SPLIT_LIMITS.expensesPerGroup + 100,
    }),
    db.splitPayment.findMany({ where: { groupId }, orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }], take: 5000 }),
    db.splitRecurring.findMany({ where: { groupId }, orderBy: { createdAt: "asc" } }),
    db.splitReminder.findMany({
      where: { groupId, createdAt: { gt: new Date(Date.now() - 14 * 86_400_000) } },
      orderBy: { createdAt: "desc" },
      select: { fromId: true, toId: true, createdAt: true },
    }),
  ]);

  const body: SplitLedgerDTO = {
    expenses: expenses.map(expenseDTO),
    payments: payments.map(paymentDTO),
    recurrings: recurrings.map(recurringDTO),
    reminders: reminders.map((r) => ({ fromId: r.fromId, toId: r.toId, createdAt: r.createdAt.toISOString() })),
  };
  return NextResponse.json(body);
}
