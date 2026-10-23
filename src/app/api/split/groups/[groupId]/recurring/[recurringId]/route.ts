import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireGroupMember } from "@/lib/split/access";
import { keyToDate } from "@/lib/split/dates";
import { normalizeRecurringInput } from "@/lib/split/input";
import { userRateLimit } from "@/lib/rate-limit";
import { recurringDTO } from "@/lib/split/serialize";
import { activeMemberIds, jsonError, logActivity, readJson, requestToday } from "@/lib/split/server";
import { materializeRecurring } from "@/lib/split/recurring-run";
import { publishSplitChange } from "@/lib/split/notify";

type Ctx = { params: Promise<{ groupId: string; recurringId: string }> };

// PATCH — {active: boolean} (пауза/возобновление) или полная замена полей шаблона. Уже созданные траты не трогаются:
// новые условия действуют на будущие периоды.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { groupId, recurringId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;
  const limited = userRateLimit(req, user.id, "split-recurring", 30, 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос");
  const current = await db.splitRecurring.findFirst({ where: { id: recurringId, groupId } });
  if (!current) return jsonError("Шаблон не найден", 404);
  const today = requestToday(req);

  let row;
  if (Object.keys(body).length === 1 && typeof body.active === "boolean") {
    row = await db.splitRecurring.update({ where: { id: recurringId }, data: { active: body.active } });
  } else {
    const group = await db.splitGroup.findUnique({ where: { id: groupId }, select: { currency: true } });
    if (!group) return jsonError("Группа не найдена", 404);
    const parsed = normalizeRecurringInput(body, { allowedMemberIds: await activeMemberIds(groupId), todayKey: today, groupCurrency: group.currency });
    if (!parsed.ok) return jsonError(parsed.error);
    const input = parsed.value;
    row = await db.splitRecurring.update({
      where: { id: recurringId },
      data: {
        description: input.description,
        category: input.category,
        amountCents: input.amountCents,
        originalAmountCents: input.original?.amountCents ?? null,
        originalCurrency: input.original?.currency ?? null,
        paidById: input.paidById,
        splitMode: input.splitMode,
        template: input.template,
        dayOfMonth: input.dayOfMonth,
        startsOn: keyToDate(input.startsOn),
        endsOn: input.endsOn ? keyToDate(input.endsOn) : null,
        // Правка шаблона после паузы из-за вышедшего участника = «починено», возобновляем
        active: typeof body.active === "boolean" ? body.active : true,
      },
    });
  }
  await logActivity(db, groupId, member.id, "recurring.updated", {
    recurringId,
    description: row.description,
    amountCents: row.amountCents,
    active: row.active,
  });
  if (row.active) await materializeRecurring(groupId, today);
  publishSplitChange(groupId, { kind: "recurring.changed", actorUserId: user.id, actorName: member.displayName });
  return NextResponse.json(recurringDTO(row));
}

// DELETE — удалить шаблон; созданные им траты остаются (связь обнуляется).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { groupId, recurringId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;

  const current = await db.splitRecurring.findFirst({ where: { id: recurringId, groupId } });
  if (!current) return jsonError("Шаблон не найден", 404);
  await db.$transaction(async (tx) => {
    await tx.splitRecurring.delete({ where: { id: recurringId } });
    await logActivity(tx, groupId, member.id, "recurring.deleted", {
      description: current.description,
      amountCents: current.amountCents,
    });
  });
  publishSplitChange(groupId, { kind: "recurring.changed", actorUserId: user.id, actorName: member.displayName });
  return NextResponse.json({ ok: true });
}
