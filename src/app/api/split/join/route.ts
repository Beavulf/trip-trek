import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { rateLimitMiddleware, userRateLimit } from "@/lib/rate-limit";
import { SPLIT_LIMITS } from "@/lib/split/access";
import { normalizeInviteCode } from "@/lib/split/invite";
import { normalizeMemberProfile } from "@/lib/split/input";
import { jsonError, logActivity, readJson } from "@/lib/split/server";
import { publishSplitChange } from "@/lib/split/notify";

// GET /api/split/join?code=ABCD2345 — превью группы по коду. Доступно и без входа: друг должен видеть,
// куда его зовут, ДО регистрации. Отдаём минимум (имя, значок, валюта, состав) + rate-limit по IP —
// коды перебирают боты. «Свободные» строки — безаккаунтные участники, которых можно присвоить («Это я»).
export async function GET(req: NextRequest) {
  const limited = rateLimitMiddleware(req, "split-join-get", 30, 60_000);
  if (limited) return limited;

  const raw = new URL(req.url).searchParams.get("code");
  if (!raw) return jsonError("Нужен код приглашения");
  const group = await db.splitGroup.findUnique({
    where: { inviteCode: normalizeInviteCode(raw) },
    select: {
      id: true,
      name: true,
      emoji: true,
      color: true,
      currency: true,
      members: {
        where: { status: "active" },
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
        select: { id: true, userId: true, displayName: true, emoji: true, color: true },
      },
    },
  });
  if (!group) return jsonError("Неверный код приглашения", 404);

  return NextResponse.json({
    name: group.name,
    emoji: group.emoji,
    color: group.color,
    currency: group.currency,
    members: group.members.map((m) => ({ name: m.displayName, emoji: m.emoji, color: m.color })),
    claimable: group.members
      .filter((m) => m.userId === null)
      .map((m) => ({ id: m.id, name: m.displayName, emoji: m.emoji, color: m.color })),
  });
}

// POST /api/split/join?code=… {claimMemberId?, displayName?, emoji?, color?} — вступить в группу.
// claimMemberId — присвоить безаккаунтного участника («Это я»): его история и долги переходят к вошедшему.
export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;
  const limited =
    rateLimitMiddleware(req, "split-join-post", 30, 60_000) || userRateLimit(req, user!.id, "split-join-post-user", 30, 60_000);
  if (limited) return limited;

  const raw = new URL(req.url).searchParams.get("code");
  if (!raw) return jsonError("Нужен код приглашения");
  const group = await db.splitGroup.findUnique({ where: { inviteCode: normalizeInviteCode(raw) } });
  if (!group) return jsonError("Неверный код приглашения", 404);

  const body = (await readJson(req)) ?? {};
  const existing = await db.splitMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId: user!.id } } });
  if (existing?.status === "active") return NextResponse.json({ groupId: group.id, alreadyMember: true });
  if (existing?.status === "removed") return jsonError("Тебя убрали из этой группы. Попроси владельца вернуть доступ.", 403);

  const mine = await db.splitMember.count({ where: { userId: user!.id, status: "active" } });
  if (mine >= SPLIT_LIMITS.groupsPerUser) return jsonError(`Не больше ${SPLIT_LIMITS.groupsPerUser} групп на человека`, 403);

  // Вернулся вышедший: та же строка, история на месте
  if (existing?.status === "left") {
    await db.$transaction(async (tx) => {
      await tx.splitMember.update({ where: { id: existing.id }, data: { status: "active", leftAt: null } });
      await logActivity(tx, group.id, existing.id, "member.joined", { memberId: existing.id, name: existing.displayName, returned: true });
    });
    publishSplitChange(group.id, { kind: "member.changed", actorUserId: user!.id, actorName: existing.displayName });
    return NextResponse.json({ groupId: group.id, memberId: existing.id });
  }

  const total = await db.splitMember.count({ where: { groupId: group.id } });
  const claimId = typeof body.claimMemberId === "string" ? body.claimMemberId : "";
  if (!claimId && total >= SPLIT_LIMITS.membersPerGroup) return jsonError("В группе уже слишком много участников", 403);

  const profileRow = await db.user.findUnique({ where: { id: user!.id }, select: { name: true, emoji: true, color: true } });
  const profile = normalizeMemberProfile(body, {
    displayName: profileRow?.name ?? "Новый участник",
    emoji: profileRow?.emoji ?? "👤",
    color: profileRow?.color ?? "#94a3b8",
  });
  if (!profile.ok) return jsonError(profile.error);

  try {
    let memberId: string;
    if (claimId) {
      // updateMany с условием userId=null — атомарно: если двое жмут «Это я» на одну строку, победит один
      const claimed = await db.splitMember.updateMany({
        where: { id: claimId, groupId: group.id, userId: null, status: "active" },
        data: { userId: user!.id },
      });
      if (claimed.count !== 1) return jsonError("Эту строку уже заняли — обнови страницу", 409);
      memberId = claimId;
      await logActivity(db, group.id, memberId, "member.claimed", { memberId });
    } else {
      const created = await db.$transaction(async (tx) => {
        const row = await tx.splitMember.create({ data: { groupId: group.id, userId: user!.id, ...profile.value } });
        await logActivity(tx, group.id, row.id, "member.joined", { memberId: row.id, name: row.displayName });
        return row;
      });
      memberId = created.id;
    }
    publishSplitChange(group.id, { kind: "member.changed", actorUserId: user!.id, actorName: profile.value.displayName });
    return NextResponse.json({ groupId: group.id, memberId });
  } catch (e) {
    // Двойной запрос «Вступить»: уникальный (groupId, userId) — значит уже вступил
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ groupId: group.id, alreadyMember: true });
    }
    throw e;
  }
}
