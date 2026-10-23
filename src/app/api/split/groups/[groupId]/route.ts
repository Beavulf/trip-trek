import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireGroupMember, requireGroupOwner } from "@/lib/split/access";
import { normalizeGroupInput } from "@/lib/split/input";
import { deleteSplitGroup, jsonError, loadGroupDTO, logActivity, readJson } from "@/lib/split/server";
import { publishSplitChange } from "@/lib/split/notify";

type Ctx = { params: Promise<{ groupId: string }> };

// GET /api/split/groups/[groupId] — группа и ВСЕ её участники (в т.ч. вышедшие: их долги остаются в расчёте).
export async function GET(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params;
  const { member, response } = await requireGroupMember(req, groupId);
  if (response) return response;
  const dto = await loadGroupDTO(groupId, member!);
  if (!dto) return jsonError("Группа не найдена", 404);
  return NextResponse.json(dto);
}

// PATCH — название/значок/цвет может менять любой участник; валюту и политику приглашений — только владелец.
// Валюту нельзя менять, когда в группе уже есть деньги: суммы хранятся в ней как есть, пересчёта нет.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;

  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос");
  const parsed = normalizeGroupInput(body, { partial: true });
  if (!parsed.ok) return jsonError(parsed.error);
  const patch = parsed.value;
  if (Object.keys(patch).length === 0) return jsonError("Нечего менять");

  const ownerOnly = patch.currency !== undefined || patch.allowMemberInvites !== undefined;
  if (ownerOnly && member.role !== "owner") return jsonError("Это может изменить только владелец группы", 403);

  if (patch.currency !== undefined) {
    const current = await db.splitGroup.findUnique({ where: { id: groupId }, select: { currency: true } });
    if (current && current.currency !== patch.currency) {
      const [expenses, payments] = await Promise.all([
        db.splitExpense.count({ where: { groupId } }),
        db.splitPayment.count({ where: { groupId } }),
      ]);
      if (expenses + payments > 0) {
        return jsonError("Валюту можно менять только в группе без трат и переводов", 409);
      }
    }
  }

  await db.$transaction(async (tx) => {
    await tx.splitGroup.update({ where: { id: groupId }, data: patch });
    await logActivity(tx, groupId, member.id, "group.updated", { fields: Object.keys(patch) });
  });
  publishSplitChange(groupId, { kind: "group.updated", actorUserId: user.id });

  const dto = await loadGroupDTO(groupId, member);
  return NextResponse.json(dto);
}

// DELETE — удалить группу со всеми тратами навсегда. Только владелец; в теле нужно имя группы (защита от случайного вызова).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params;
  const access = await requireGroupOwner(req, groupId);
  if (access.response) return access.response;

  const body = await readJson(req);
  const group = await db.splitGroup.findUnique({ where: { id: groupId }, select: { name: true } });
  if (!group) return jsonError("Группа не найдена", 404);
  if (!body || body.name !== group.name) return jsonError("Для удаления передай точное название группы", 400);

  await deleteSplitGroup(groupId);
  publishSplitChange(groupId, { kind: "group.updated", actorUserId: access.user.id });
  return NextResponse.json({ ok: true });
}
