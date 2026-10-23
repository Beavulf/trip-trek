import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireGroupMember } from "@/lib/split/access";
import { diffExpense, type ExpenseSnapshot } from "@/lib/split/activity";
import { dateToKey, keyToDate } from "@/lib/split/dates";
import { normalizeExpenseInput } from "@/lib/split/input";
import { userRateLimit } from "@/lib/rate-limit";
import { EXPENSE_INCLUDE, expenseDTO } from "@/lib/split/serialize";
import { activeMemberIds, jsonError, logActivity, readJson, requestToday } from "@/lib/split/server";
import { isSplitMode } from "@/lib/split/split";
import { publishSplitChange } from "@/lib/split/notify";

type Ctx = { params: Promise<{ groupId: string; expenseId: string }> };

// PATCH — полная замена полей траты (форма правки шлёт всё то же, что при создании).
// Править может любой участник группы (ADR-0009), поэтому каждое изменение пишется в журнал с диффом.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { groupId, expenseId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;
  const limited = userRateLimit(req, user.id, "split-expense", 120, 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос");

  const before = await db.splitExpense.findFirst({ where: { id: expenseId, groupId }, include: EXPENSE_INCLUDE });
  if (!before) return jsonError("Трата не найдена", 404);

  // Вышедший участник, уже стоявший в трате, остаётся допустимым: правка суммы не должна ломаться из-за состава
  const allowed = await activeMemberIds(groupId);
  allowed.add(before.paidById);
  for (const s of before.shares) allowed.add(s.memberId);

  const group = await db.splitGroup.findUnique({ where: { id: groupId }, select: { currency: true } });
  if (!group) return jsonError("Группа не найдена", 404);
  const parsed = normalizeExpenseInput(body, { allowedMemberIds: allowed, todayKey: requestToday(req), groupCurrency: group.currency });
  if (!parsed.ok) return jsonError(parsed.error);
  const input = parsed.value;

  const snapshotBefore: ExpenseSnapshot = {
    description: before.description,
    amountCents: before.amountCents,
    original: before.originalCurrency ? `${before.originalCurrency}:${before.originalAmountCents}` : null,
    category: before.category,
    paidById: before.paidById,
    spentOn: dateToKey(before.spentOn),
    note: before.note,
    splitMode: isSplitMode(before.splitMode) ? before.splitMode : "equal",
    shares: before.shares.map((s) => ({ memberId: s.memberId, cents: s.cents, weight: s.weight })),
  };
  const snapshotAfter: ExpenseSnapshot = {
    description: input.description,
    amountCents: input.amountCents,
    original: input.original ? `${input.original.currency}:${input.original.amountCents}` : null,
    category: input.category,
    paidById: input.paidById,
    spentOn: input.spentOn,
    note: input.note,
    splitMode: input.splitMode,
    shares: input.shares.map((s) => ({ memberId: s.memberId, cents: s.cents, weight: s.weight })),
  };
  const changes = diffExpense(snapshotBefore, snapshotAfter);
  // Ничего не поменялось — журнал и остальных не тревожим
  if (changes.length === 0) return NextResponse.json(expenseDTO(before));

  const updated = await db.$transaction(async (tx) => {
    await tx.splitShare.deleteMany({ where: { expenseId } });
    const row = await tx.splitExpense.update({
      where: { id: expenseId },
      data: {
        amountCents: input.amountCents,
        originalAmountCents: input.original?.amountCents ?? null,
        originalCurrency: input.original?.currency ?? null,
        description: input.description,
        category: input.category,
        paidById: input.paidById,
        spentOn: keyToDate(input.spentOn),
        note: input.note,
        splitMode: input.splitMode,
        shares: { create: input.shares.map((s) => ({ memberId: s.memberId, cents: s.cents, weight: s.weight })) },
      },
      include: EXPENSE_INCLUDE,
    });
    await logActivity(tx, groupId, member.id, "expense.updated", {
      expenseId,
      description: row.description,
      amountCents: row.amountCents,
      changes: changes.map((c) => ({ field: c.field, from: c.from ?? null, to: c.to ?? null })),
    });
    return row;
  });

  publishSplitChange(groupId, {
    kind: "expense.updated",
    actorUserId: user.id,
    actorName: member.displayName,
    description: updated.description,
    amountCents: updated.amountCents,
    currency: group.currency,
  });
  return NextResponse.json(expenseDTO(updated));
}

// DELETE — удалить трату. Любой участник; в журнал уходит снимок, чтобы было видно, что именно удалили.
// Трата из повторяющегося шаблона: период запоминается в skippedPeriods, иначе ленивая материализация воскресила бы её.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { groupId, expenseId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;
  const limited = userRateLimit(req, user.id, "split-expense", 120, 60_000);
  if (limited) return limited;

  const expense = await db.splitExpense.findFirst({ where: { id: expenseId, groupId } });
  if (!expense) return jsonError("Трата не найдена", 404);

  await db.$transaction(async (tx) => {
    if (expense.recurringId && expense.recurringPeriod) {
      await tx.splitRecurring.update({
        where: { id: expense.recurringId },
        data: { skippedPeriods: { push: expense.recurringPeriod } },
      });
    }
    await tx.splitExpense.delete({ where: { id: expenseId } });
    await logActivity(tx, groupId, member.id, "expense.deleted", {
      description: expense.description,
      amountCents: expense.amountCents,
      category: expense.category,
      spentOn: dateToKey(expense.spentOn),
    });
  });

  const group = await db.splitGroup.findUnique({ where: { id: groupId }, select: { currency: true } });
  publishSplitChange(groupId, {
    kind: "expense.deleted",
    actorUserId: user.id,
    actorName: member.displayName,
    description: expense.description,
    amountCents: expense.amountCents,
    currency: group?.currency,
  });
  return NextResponse.json({ ok: true });
}
