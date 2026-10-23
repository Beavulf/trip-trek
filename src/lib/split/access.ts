import { NextResponse, type NextRequest } from "next/server";
import type { SplitMember } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserFromRequest, requireUser } from "@/lib/api-auth";

// Гарды API «Сочтёмся» — аналог requireTripMember/Owner из api-auth для групп.
// Доступ только у АКТИВНОГО участника с аккаунтом: вышедший/исключённый получает 403, как и посторонний
// (существование группы не раскрываем). Зрителей в группах нет — все активные участники могут писать.

type AuthedUser = NonNullable<Awaited<ReturnType<typeof getUserFromRequest>>>;

export type GroupAccess =
  | { user: AuthedUser; member: SplitMember; response: null }
  | { user: null; member: null; response: NextResponse };

const forbidden = (error: string): GroupAccess => ({
  user: null,
  member: null,
  response: NextResponse.json({ error }, { status: 403 }),
});

export async function requireGroupMember(req: NextRequest, groupId: string): Promise<GroupAccess> {
  const { user, response } = await requireUser(req);
  if (response) return { user: null, member: null, response };
  if (!groupId) return forbidden("Нет доступа к этой группе");

  const member = await db.splitMember.findUnique({
    where: { groupId_userId: { groupId, userId: user!.id } },
  });
  if (!member || member.status !== "active") return forbidden("Нет доступа к этой группе");
  return { user: user!, member, response: null };
}

export async function requireGroupOwner(req: NextRequest, groupId: string): Promise<GroupAccess> {
  const access = await requireGroupMember(req, groupId);
  if (access.response) return access;
  if (access.member.role !== "owner") return forbidden("Это может сделать только владелец группы");
  return access;
}

/** Потолки против злоупотреблений (лимитов free-плана на раздел нет — ADR-0009, но безлимитный рост не нужен). */
export const SPLIT_LIMITS = {
  /** Групп, в которых человек состоит */
  groupsPerUser: 30,
  /** Участников в группе, включая вышедших и безаккаунтных */
  membersPerGroup: 40,
  /** Трат в группе: расчёт отдаёт их одним ответом */
  expensesPerGroup: 20_000,
  /** Активных шаблонов повторяющихся трат */
  recurringPerGroup: 30,
} as const;
