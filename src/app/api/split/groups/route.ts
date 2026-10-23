import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { userRateLimit } from "@/lib/rate-limit";
import { SPLIT_LIMITS } from "@/lib/split/access";
import { generateInviteCode } from "@/lib/split/invite-server";
import { normalizeGroupInput, normalizeMemberProfile } from "@/lib/split/input";
import { jsonError, loadGroupDTO, logActivity, readJson } from "@/lib/split/server";
import type { SplitGroupSummaryDTO } from "@/lib/split/types";

// GET /api/split/groups — мои группы для хаба: состав и мой баланс в каждой.
// Баланс считается агрегатами по моим строкам участника (5 запросов на любое число групп),
// а не выкачиванием всех трат: хаб открывается чаще всего.
export async function GET(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const mine = await db.splitMember.findMany({
    where: { userId: user!.id, status: "active" },
    include: {
      group: {
        include: {
          members: {
            where: { status: "active" },
            orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
            include: { user: { select: { avatarUrl: true } } },
          },
        },
      },
    },
  });
  if (mine.length === 0) return NextResponse.json([] satisfies SplitGroupSummaryDTO[]);

  const memberIds = mine.map((m) => m.id);
  const groupIds = mine.map((m) => m.groupId);
  const [paid, owed, sent, got, lastSeen] = await Promise.all([
    db.splitExpense.groupBy({ by: ["paidById"], where: { paidById: { in: memberIds } }, _sum: { amountCents: true } }),
    db.splitShare.groupBy({ by: ["memberId"], where: { memberId: { in: memberIds } }, _sum: { cents: true } }),
    db.splitPayment.groupBy({ by: ["fromId"], where: { fromId: { in: memberIds } }, _sum: { amountCents: true } }),
    db.splitPayment.groupBy({ by: ["toId"], where: { toId: { in: memberIds } }, _sum: { amountCents: true } }),
    db.splitActivity.groupBy({ by: ["groupId"], where: { groupId: { in: groupIds } }, _max: { createdAt: true } }),
  ]);
  const paidBy = new Map(paid.map((r) => [r.paidById, r._sum.amountCents ?? 0]));
  const owedBy = new Map(owed.map((r) => [r.memberId, r._sum.cents ?? 0]));
  const sentBy = new Map(sent.map((r) => [r.fromId, r._sum.amountCents ?? 0]));
  const gotBy = new Map(got.map((r) => [r.toId, r._sum.amountCents ?? 0]));
  const seenBy = new Map(lastSeen.map((r) => [r.groupId, r._max.createdAt]));

  const list: SplitGroupSummaryDTO[] = mine.map((m) => ({
    id: m.group.id,
    name: m.group.name,
    emoji: m.group.emoji,
    color: m.group.color,
    currency: m.group.currency,
    memberCount: m.group.members.length,
    members: m.group.members.slice(0, 6).map((x) => ({
      id: x.id,
      name: x.displayName,
      emoji: x.emoji,
      color: x.color,
      avatarUrl: x.user?.avatarUrl ?? null,
    })),
    myMemberId: m.id,
    // Тот же баланс, что memberBalances() на клиенте: заплатил − доли + отдал − получил
    myBalanceCents:
      (paidBy.get(m.id) ?? 0) - (owedBy.get(m.id) ?? 0) + (sentBy.get(m.id) ?? 0) - (gotBy.get(m.id) ?? 0),
    lastActivityAt: (seenBy.get(m.groupId) ?? m.group.updatedAt).toISOString(),
  }));
  list.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  return NextResponse.json(list);
}

// POST /api/split/groups — создать группу; создатель становится владельцем.
export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;
  const limited = userRateLimit(req, user!.id, "split-group-create", 20, 60 * 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  if (!body) return jsonError("Некорректный запрос");
  const parsed = normalizeGroupInput(body, { partial: false });
  if (!parsed.ok) return jsonError(parsed.error);
  const input = parsed.value;

  const count = await db.splitMember.count({ where: { userId: user!.id, status: "active" } });
  if (count >= SPLIT_LIMITS.groupsPerUser) return jsonError(`Не больше ${SPLIT_LIMITS.groupsPerUser} групп на человека`, 403);

  // Профиль владельца в группе: по умолчанию как в аккаунте, можно переопределить
  const profile = await db.user.findUnique({ where: { id: user!.id }, select: { name: true, emoji: true, color: true } });
  const mine = normalizeMemberProfile(body, {
    displayName: profile?.name ?? "Я",
    emoji: profile?.emoji ?? "👤",
    color: profile?.color ?? "#94a3b8",
  });
  if (!mine.ok) return jsonError(mine.error);

  // Короткий код может (крайне редко) столкнуться — несколько попыток
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const group = await db.$transaction(async (tx) => {
        const g = await tx.splitGroup.create({
          data: {
            name: input.name!,
            emoji: input.emoji ?? "🏠",
            color: input.color ?? "#10b981",
            currency: input.currency!,
            inviteCode: generateInviteCode(),
            members: {
              create: {
                userId: user!.id,
                role: "owner",
                displayName: mine.value.displayName,
                emoji: mine.value.emoji,
                color: mine.value.color,
              },
            },
          },
          include: { members: true },
        });
        await logActivity(tx, g.id, g.members[0].id, "group.created", { name: g.name });
        return g;
      });
      const dto = await loadGroupDTO(group.id, group.members[0]);
      return NextResponse.json(dto, { status: 201 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return jsonError("Не удалось создать группу, попробуй ещё раз", 503);
}
