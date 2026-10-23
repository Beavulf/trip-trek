import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireGroupMember, SPLIT_LIMITS } from "@/lib/split/access";
import { keyToDate } from "@/lib/split/dates";
import { normalizeRecurringInput } from "@/lib/split/input";
import { userRateLimit } from "@/lib/rate-limit";
import { recurringDTO } from "@/lib/split/serialize";
import { activeMemberIds, jsonError, logActivity, readJson, requestToday } from "@/lib/split/server";
import { materializeRecurring } from "@/lib/split/recurring-run";
import { publishSplitChange } from "@/lib/split/notify";

type Ctx = { params: Promise<{ groupId: string }> };

// POST /api/split/groups/[groupId]/recurring — шаблон повторяющейся траты (аренда, интернет, подписка).
// Сразу материализуем: шаблон с началом в прошлом месяце должен тут же дать нужные траты, не ждать чьего-то захода.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;
  const limited = userRateLimit(req, user.id, "split-recurring", 30, 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос");
  const today = requestToday(req);
  const group = await db.splitGroup.findUnique({ where: { id: groupId }, select: { currency: true } });
  if (!group) return jsonError("Группа не найдена", 404);
  const parsed = normalizeRecurringInput(body, { allowedMemberIds: await activeMemberIds(groupId), todayKey: today, groupCurrency: group.currency });
  if (!parsed.ok) return jsonError(parsed.error);
  const input = parsed.value;

  const count = await db.splitRecurring.count({ where: { groupId, active: true } });
  if (count >= SPLIT_LIMITS.recurringPerGroup) return jsonError("Слишком много повторяющихся трат", 403);

  const row = await db.$transaction(async (tx) => {
    const created = await tx.splitRecurring.create({
      data: {
        groupId,
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
        createdById: member.id,
      },
    });
    await logActivity(tx, groupId, member.id, "recurring.created", {
      recurringId: created.id,
      description: created.description,
      amountCents: created.amountCents,
    });
    return created;
  });

  await materializeRecurring(groupId, today);
  publishSplitChange(groupId, { kind: "recurring.changed", actorUserId: user.id, actorName: member.displayName });
  return NextResponse.json(recurringDTO(row), { status: 201 });
}
