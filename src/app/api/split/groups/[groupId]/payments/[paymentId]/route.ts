import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireGroupMember } from "@/lib/split/access";
import { userRateLimit } from "@/lib/rate-limit";
import { jsonError, logActivity } from "@/lib/split/server";
import { publishSplitChange } from "@/lib/split/notify";

type Ctx = { params: Promise<{ groupId: string; paymentId: string }> };

// DELETE — отменить ошибочную отметку перевода. Любой участник группы, в журнале остаётся след.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { groupId, paymentId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;
  const limited = userRateLimit(req, user.id, "split-payment", 60, 60_000);
  if (limited) return limited;

  const payment = await db.splitPayment.findFirst({ where: { id: paymentId, groupId } });
  if (!payment) return jsonError("Перевод не найден", 404);

  await db.$transaction(async (tx) => {
    await tx.splitPayment.delete({ where: { id: paymentId } });
    await logActivity(tx, groupId, member.id, "payment.deleted", {
      fromId: payment.fromId,
      toId: payment.toId,
      amountCents: payment.amountCents,
    });
  });
  publishSplitChange(groupId, { kind: "payment.deleted", actorUserId: user.id, actorName: member.displayName });
  return NextResponse.json({ ok: true });
}
