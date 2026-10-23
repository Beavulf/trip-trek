import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireGroupMember, SPLIT_LIMITS } from "@/lib/split/access";
import { normalizeMemberProfile } from "@/lib/split/input";
import { userRateLimit } from "@/lib/rate-limit";
import { MEMBER_INCLUDE, memberDTO } from "@/lib/split/serialize";
import { jsonError, logActivity, readJson } from "@/lib/split/server";
import { publishSplitChange } from "@/lib/split/notify";

type Ctx = { params: Promise<{ groupId: string }> };

// POST /api/split/groups/[groupId]/members — добавить участника БЕЗ аккаунта (друг ещё не зарегистрирован).
// Его долги ведутся как у всех; позже друг заходит по коду группы и выбирает «Это я» — строка достаётся ему.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params;
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access.response;
  const { user, member } = access;
  const limited = userRateLimit(req, user.id, "split-member-add", 30, 60 * 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос");
  const profile = normalizeMemberProfile(body);
  if (!profile.ok) return jsonError(profile.error);

  const total = await db.splitMember.count({ where: { groupId } });
  if (total >= SPLIT_LIMITS.membersPerGroup) return jsonError("В группе слишком много участников", 403);

  const created = await db.$transaction(async (tx) => {
    const row = await tx.splitMember.create({
      data: { groupId, userId: null, ...profile.value },
      include: MEMBER_INCLUDE,
    });
    await logActivity(tx, groupId, member.id, "member.added", { memberId: row.id, name: row.displayName });
    return row;
  });
  publishSplitChange(groupId, { kind: "member.changed", actorUserId: user.id, actorName: member.displayName });
  return NextResponse.json(memberDTO(created), { status: 201 });
}
