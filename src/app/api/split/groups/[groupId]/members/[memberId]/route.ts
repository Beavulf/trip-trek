import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireGroupMember } from "@/lib/split/access";
import { normalizeMemberProfile } from "@/lib/split/input";
import { MEMBER_INCLUDE, memberDTO } from "@/lib/split/serialize";
import { jsonError, logActivity, readJson } from "@/lib/split/server";
import { evictFromGroupRoom, publishSplitChange } from "@/lib/split/notify";

type Ctx = { params: Promise<{ groupId: string; memberId: string }> };

// PATCH — профиль участника (имя, значок, цвет) или передача владения ({role: "owner"}).
// Профиль: себя — каждый; безаккаунтного — любой участник; реального человека — владелец.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { groupId, memberId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;

  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос");
  const target = await db.splitMember.findFirst({ where: { id: memberId, groupId } });
  if (!target) return jsonError("Участник не найден", 404);

  if (body.role !== undefined) {
    if (body.role !== "owner") return jsonError("Некорректная роль");
    if (member.role !== "owner") return jsonError("Передать владение может только владелец", 403);
    if (!target.userId || target.status !== "active" || target.id === member.id) {
      return jsonError("Владение можно передать только другому участнику с аккаунтом");
    }
    await db.$transaction([
      db.splitMember.update({ where: { id: member.id }, data: { role: "member" } }),
      db.splitMember.update({ where: { id: target.id }, data: { role: "owner" } }),
    ]);
    publishSplitChange(groupId, { kind: "member.changed", actorUserId: user.id, actorName: member.displayName });
    return NextResponse.json({ ok: true });
  }

  const canEdit = target.id === member.id || target.userId === null || member.role === "owner";
  if (!canEdit) return jsonError("Профиль другого участника может менять только владелец", 403);

  const profile = normalizeMemberProfile(body, {
    displayName: target.displayName,
    emoji: target.emoji,
    color: target.color,
  });
  if (!profile.ok) return jsonError(profile.error);

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.splitMember.update({ where: { id: memberId }, data: profile.value, include: MEMBER_INCLUDE });
    if (row.displayName !== target.displayName) {
      await logActivity(tx, groupId, member.id, "member.renamed", {
        memberId,
        from: target.displayName,
        to: row.displayName,
      });
    }
    return row;
  });
  publishSplitChange(groupId, { kind: "member.changed", actorUserId: user.id, actorName: member.displayName });
  return NextResponse.json(memberDTO(updated));
}

// DELETE — выйти из группы (себя) или убрать участника (владелец). Строка остаётся (status), если на ней есть история:
// долги и траты вышедшего не пропадают. Безаккаунтного без истории (опечатка при добавлении) удаляем совсем.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { groupId, memberId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;

  const target = await db.splitMember.findFirst({ where: { id: memberId, groupId } });
  if (!target || target.status !== "active") return jsonError("Участник не найден", 404);

  const isSelf = target.id === member.id;
  if (isSelf && member.role === "owner") {
    return jsonError("Владелец не может выйти из группы. Передай владение другому участнику или удали группу.");
  }

  const hasHistory =
    (await Promise.all([
      db.splitExpense.count({ where: { OR: [{ paidById: memberId }, { createdById: memberId }] } }),
      db.splitShare.count({ where: { memberId } }),
      db.splitPayment.count({ where: { OR: [{ fromId: memberId }, { toId: memberId }, { createdById: memberId }] } }),
    ])).some((n) => n > 0);

  const removableByAnyone = target.userId === null && !hasHistory;
  if (!isSelf && !removableByAnyone && member.role !== "owner") {
    return jsonError("Убрать участника может только владелец", 403);
  }

  await db.$transaction(async (tx) => {
    if (removableByAnyone) {
      await tx.splitMember.delete({ where: { id: memberId } });
    } else {
      await tx.splitMember.update({
        where: { id: memberId },
        data: { status: isSelf ? "left" : "removed", leftAt: new Date() },
      });
    }
    await logActivity(tx, groupId, member.id, isSelf ? "member.left" : "member.removed", {
      memberId,
      name: target.displayName,
    });
  });
  if (target.userId) evictFromGroupRoom(groupId, target.userId);
  publishSplitChange(groupId, { kind: "member.changed", actorUserId: user.id, actorName: member.displayName });
  return NextResponse.json({ ok: true });
}
