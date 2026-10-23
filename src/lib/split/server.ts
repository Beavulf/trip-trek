import { NextResponse, type NextRequest } from "next/server";
import type { Prisma, SplitMember } from "@prisma/client";
import { db } from "@/lib/db";
import { dateToKey, diffDays, isDateKey } from "./dates";
import type { ActivityType } from "./activity";
import { MEMBER_INCLUDE, memberDTO } from "./serialize";
import type { SplitGroupDTO } from "./types";

// Общие помощники API-роутов «Сочтёмся» (server-only: тянут БД).

export const jsonError = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = (await req.json().catch(() => null)) as unknown;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

const utcToday = () => dateToKey(new Date());

/**
 * «Сегодня» запроса. Клиент присылает свою локальную дату (`?today=`) — «вчерашний чек» и «сегодня»
 * считаются по календарю пользователя, а не сервера. Верим не дальше суток от серверной UTC-даты:
 * это часовые пояса, а не способ внести трату в 2099-м.
 */
export function requestToday(req: NextRequest): string {
  const q = new URL(req.url).searchParams.get("today");
  const utc = utcToday();
  return isDateKey(q) && Math.abs(diffDays(utc, q)) <= 1 ? q : utc;
}

export async function activeMemberIds(groupId: string): Promise<Set<string>> {
  const rows = await db.splitMember.findMany({ where: { groupId, status: "active" }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

export async function allMemberIds(groupId: string): Promise<Set<string>> {
  const rows = await db.splitMember.findMany({ where: { groupId }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

type Db = Prisma.TransactionClient | typeof db;

/** Запись в журнал группы. Вызывается внутри той же транзакции, что и сама мутация. */
export function logActivity(client: Db, groupId: string, actorId: string | null, type: ActivityType, data: Prisma.InputJsonObject) {
  return client.splitActivity.create({ data: { groupId, actorId, type, data } });
}

export async function loadGroupDTO(groupId: string, me: SplitMember): Promise<SplitGroupDTO | null> {
  const group = await db.splitGroup.findUnique({
    where: { id: groupId },
    include: {
      members: { include: MEMBER_INCLUDE, orderBy: [{ joinedAt: "asc" }, { id: "asc" }] },
    },
  });
  if (!group) return null;
  // Политика приглашений как у поездок: пока allowMemberInvites=false, код видит только владелец
  const canSeeCode = me.role === "owner" || group.allowMemberInvites;
  return {
    id: group.id,
    name: group.name,
    emoji: group.emoji,
    color: group.color,
    currency: group.currency,
    inviteCode: canSeeCode ? group.inviteCode : null,
    allowMemberInvites: group.allowMemberInvites,
    myMemberId: me.id,
    myRole: me.role === "owner" ? "owner" : "member",
    members: group.members.map(memberDTO),
    createdAt: group.createdAt.toISOString(),
  };
}

/**
 * Удалить группу со всем содержимым. Каскад БД здесь не годится: ссылки трат/долей/переводов на участника
 * намеренно без CASCADE (участника с историей нельзя удалить по ошибке), а Postgres удаляет каскадом
 * дочерние таблицы в произвольном порядке — участники могли уйти раньше долей и сломать FK.
 * Поэтому порядок задан явно, всё в одной транзакции.
 */
export function deleteSplitGroup(groupId: string) {
  return db.$transaction([
    db.splitShare.deleteMany({ where: { expense: { groupId } } }),
    db.splitExpense.deleteMany({ where: { groupId } }),
    db.splitPayment.deleteMany({ where: { groupId } }),
    db.splitRecurring.deleteMany({ where: { groupId } }),
    db.splitActivity.deleteMany({ where: { groupId } }),
    db.splitMember.deleteMany({ where: { groupId } }),
    db.splitGroup.delete({ where: { id: groupId } }),
  ]);
}
