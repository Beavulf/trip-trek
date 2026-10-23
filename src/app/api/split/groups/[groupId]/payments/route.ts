import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireGroupMember } from "@/lib/split/access";
import { keyToDate } from "@/lib/split/dates";
import { normalizePaymentInput } from "@/lib/split/input";
import { userRateLimit } from "@/lib/rate-limit";
import { paymentDTO } from "@/lib/split/serialize";
import { allMemberIds, jsonError, logActivity, readJson, requestToday } from "@/lib/split/server";
import { notifyPaymentRecorded, publishSplitChange } from "@/lib/split/notify";

type Ctx = { params: Promise<{ groupId: string }> };

// POST /api/split/groups/[groupId]/payments — «отдал деньги»: записать может любая сторона пары (ADR-0009).
// Перевод больше долга разрешён (получится встречный долг) — предупреждает UI. Повтор с тем же clientKey
// возвращает уже созданный перевод: двойной тап и ретрай сети не задваивают.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;
  const limited = userRateLimit(req, user.id, "split-payment", 60, 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос");
  const parsed = normalizePaymentInput(body, { knownMemberIds: await allMemberIds(groupId), todayKey: requestToday(req) });
  if (!parsed.ok) return jsonError(parsed.error);
  const input = parsed.value;

  // Чужой перевод записывать нельзя: автор — одна из сторон пары
  if (member.id !== input.fromId && member.id !== input.toId) {
    return jsonError("Записать перевод может только тот, кто отдал, или тот, кто получил", 403);
  }

  // «За такую-то трату»: трата должна быть из этой группы (чужой id — не повод привязать перевод к чужим данным)
  let forExpense: { id: string; description: string } | null = null;
  if (input.expenseId) {
    forExpense = await db.splitExpense.findFirst({ where: { id: input.expenseId, groupId }, select: { id: true, description: true } });
    if (!forExpense) return jsonError("Трата не найдена в этой группе", 400);
  }

  if (input.clientKey) {
    const existing = await db.splitPayment.findUnique({
      where: { groupId_clientKey: { groupId, clientKey: input.clientKey } },
    });
    if (existing) return NextResponse.json(paymentDTO(existing));
  }

  let payment;
  try {
    payment = await db.$transaction(async (tx) => {
      const created = await tx.splitPayment.create({
        data: {
          groupId,
          fromId: input.fromId,
          toId: input.toId,
          amountCents: input.amountCents,
          paidOn: keyToDate(input.paidOn),
          note: input.note,
          expenseId: forExpense?.id ?? null,
          createdById: member.id,
          clientKey: input.clientKey,
        },
      });
      await logActivity(tx, groupId, member.id, "payment.created", {
        paymentId: created.id,
        fromId: created.fromId,
        toId: created.toId,
        amountCents: created.amountCents,
        ...(forExpense ? { expenseId: forExpense.id, description: forExpense.description } : {}),
      });
      return created;
    });
  } catch (e) {
    // Гонка двух одинаковых запросов: второй упёрся в уникальный (groupId, clientKey) — отдаём созданный первым
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && input.clientKey) {
      const existing = await db.splitPayment.findUnique({
        where: { groupId_clientKey: { groupId, clientKey: input.clientKey } },
      });
      if (existing) return NextResponse.json(paymentDTO(existing));
    }
    throw e;
  }

  const group = await db.splitGroup.findUnique({ where: { id: groupId }, select: { name: true, currency: true } });
  publishSplitChange(groupId, {
    kind: "payment.created",
    actorUserId: user.id,
    actorName: member.displayName,
    amountCents: payment.amountCents,
    currency: group?.currency,
  });
  if (group) {
    void notifyPaymentRecorded({
      groupId,
      groupName: group.name,
      currency: group.currency,
      actorName: member.displayName,
      actorMemberId: member.id,
      fromId: payment.fromId,
      toId: payment.toId,
      amountCents: payment.amountCents,
      forDescription: forExpense?.description,
    });
  }
  return NextResponse.json(paymentDTO(payment), { status: 201 });
}
