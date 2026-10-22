import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { userRateLimit } from "@/lib/rate-limit";
import { calculateSettlements, moneyParticipants } from "@/lib/budget";
import type { Expense, Participant } from "@/lib/types";

// GET /api/participants/debts?tripId=&userId= — незакрытые долги участника перед выходом/исключением.
// Только предупреждение для диалога подтверждения: выйти или исключить это не блокирует.
// userId по умолчанию — сам запрашивающий; чужие долги смотрит только владелец поездки.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId") || "";
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const { user, membership, response } = await requireTripMember(req, tripId);
  if (response) return response;
  const limited = userRateLimit(req, user!.id, "participants-debts", 60, 60_000);
  if (limited) return limited;

  const targetId = searchParams.get("userId") || user!.id;
  if (targetId !== user!.id && membership!.role !== "owner") {
    return NextResponse.json({ error: "Чужие долги видит только владелец поездки" }, { status: 403 });
  }

  const [members, expenses] = await Promise.all([
    db.tripMember.findMany({
      where: { tripId },
      include: { user: { select: { name: true, emoji: true, color: true } } },
    }),
    db.expense.findMany({
      where: { tripId },
      select: { id: true, amount: true, category: true, paidById: true, splitWith: true, excludeSelf: true },
    }),
  ]);

  const active: Participant[] = members.map((m) => ({
    id: m.userId,
    name: m.displayName || m.user.name,
    color: m.color,
    emoji: m.emoji,
    role: m.role,
    budget: m.budget,
  }));

  // Имена бывших — из профилей (как в /api/trip); нужны только для подписей в предупреждении
  const knownIds = new Set(active.map((p) => p.id));
  const shapes = expenses as unknown as Expense[];
  const missing = new Set<string>();
  for (const e of expenses) {
    for (const id of [e.paidById, ...(e.splitWith || "").split(",")]) if (id && !knownIds.has(id)) missing.add(id);
  }
  const formerUsers = missing.size
    ? await db.user.findMany({
        where: { id: { in: [...missing] } },
        select: { id: true, name: true, emoji: true, color: true },
      })
    : [];
  const former: Participant[] = formerUsers.map((u) => ({
    id: u.id,
    name: u.name,
    color: u.color,
    emoji: u.emoji,
    role: null,
    budget: null,
    former: true,
  }));

  const people = moneyParticipants(active, former, shapes);
  const debts = calculateSettlements(shapes, people)
    .filter((s) => s.from.id === targetId || s.to.id === targetId)
    .map((s) =>
      s.from.id === targetId
        ? { direction: "owes" as const, otherId: s.to.id, otherName: s.to.name, amount: s.amount }
        : { direction: "owed" as const, otherId: s.from.id, otherName: s.from.name, amount: s.amount }
    );

  return NextResponse.json({ debts });
}
