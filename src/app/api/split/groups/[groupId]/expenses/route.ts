import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireGroupMember, SPLIT_LIMITS } from "@/lib/split/access";
import { keyToDate } from "@/lib/split/dates";
import { normalizeExpenseInput } from "@/lib/split/input";
import { userRateLimit } from "@/lib/rate-limit";
import { EXPENSE_INCLUDE, expenseDTO } from "@/lib/split/serialize";
import { activeMemberIds, jsonError, logActivity, readJson, requestToday } from "@/lib/split/server";
import { notifyExpenseCreated, publishSplitChange } from "@/lib/split/notify";

type Ctx = { params: Promise<{ groupId: string }> };

// POST /api/split/groups/[groupId]/expenses — добавить трату.
// Доли считает и проверяет сервер (Σ долей = сумме): форма присылает только «кто платил, на кого и как делить».
export async function POST(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;
  const limited = userRateLimit(req, user.id, "split-expense", 120, 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос");

  const [allowed, total, group] = await Promise.all([
    activeMemberIds(groupId),
    db.splitExpense.count({ where: { groupId } }),
    db.splitGroup.findUnique({ where: { id: groupId }, select: { name: true, currency: true } }),
  ]);
  if (!group) return jsonError("Группа не найдена", 404);
  if (total >= SPLIT_LIMITS.expensesPerGroup) return jsonError("В группе слишком много трат", 403);

  const parsed = normalizeExpenseInput(body, { allowedMemberIds: allowed, todayKey: requestToday(req), groupCurrency: group.currency });
  if (!parsed.ok) return jsonError(parsed.error);
  const input = parsed.value;

  const expense = await db.$transaction(async (tx) => {
    const created = await tx.splitExpense.create({
      data: {
        groupId,
        amountCents: input.amountCents,
        originalAmountCents: input.original?.amountCents ?? null,
        originalCurrency: input.original?.currency ?? null,
        description: input.description,
        category: input.category,
        paidById: input.paidById,
        spentOn: keyToDate(input.spentOn),
        note: input.note,
        splitMode: input.splitMode,
        createdById: member.id,
        shares: { create: input.shares.map((s) => ({ memberId: s.memberId, cents: s.cents, weight: s.weight })) },
      },
      include: EXPENSE_INCLUDE,
    });
    await logActivity(tx, groupId, member.id, "expense.created", {
      expenseId: created.id,
      description: created.description,
      amountCents: created.amountCents,
      category: created.category,
    });
    return created;
  });

  publishSplitChange(groupId, {
    kind: "expense.created",
    actorUserId: user.id,
    actorName: member.displayName,
    description: expense.description,
    amountCents: expense.amountCents,
    currency: group.currency,
  });
  void notifyExpenseCreated({
    groupId,
    groupName: group.name,
    currency: group.currency,
    actorUserId: user.id,
    actorName: member.displayName,
    description: expense.description,
    amountCents: expense.amountCents,
    paidById: expense.paidById,
    shares: expense.shares,
  });

  return NextResponse.json(expenseDTO(expense), { status: 201 });
}
