import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember, requireTripEditor } from "@/lib/api-auth";
import { currencySymbol } from "@/lib/currencies";
import { Prisma } from "@prisma/client";
import { expenseUserIds } from "@/lib/budget";
import {
  normalizeExpenseInput,
  checkSettlementAgainstDebt,
  SETTLEMENT_CATEGORY,
  type NormalizedExpense,
} from "@/lib/budget/expense-input";

// GET /api/expenses?tripId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json([]);

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  // Include day (для UI «День N» в ExpenseRow) + avatarUrl плательщика (аватар в списках)
  const expenses = await db.expense.findMany({
    // Расчёт долгов идёт по ВСЕМ тратам поездки: обрезка по лимиту молча искажала бы балансы
    // (старые траты и переводы выпадали бы). 5000 — страховка от аварийного размера, не рабочий предел
    take: 5000,
    where: { tripId },
    include: {
      paidBy: { select: { id: true, name: true, emoji: true, color: true, avatarUrl: true } },
      day: { select: { dayNumber: true, city: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(expenses);
}

// POST /api/expenses — добавить трату (или перевод category "settlement").
// Вход нормализует normalizeExpenseInput (дубли/плательщик в splitWith, форма перевода, сумма);
// перевод дополнительно проверяется на сервере против реального долга пары.
const EXPENSE_INCLUDE = {
  paidBy: { select: { id: true, name: true, emoji: true, color: true } },
  day: { select: { dayNumber: true, city: true } },
} as const;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const tripId = typeof body.tripId === "string" ? body.tripId : "";
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const { user, response } = await requireTripEditor(req, tripId);
  if (response) return response;

  const parsed = normalizeExpenseInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;
  const isSettlement = input.category === SETTLEMENT_CATEGORY;

  // P1 #14: плательщик и делящие — участники поездки. Исключение — перевод: деньги вернул или
  // получил тот, кто уже вышел из поездки, но остался в тратах (его долг закрывают оставшиеся)
  const members = await db.tripMember.findMany({ where: { tripId }, select: { userId: true } });
  const memberIds = new Set(members.map((m) => m.userId));

  // dayId обязан принадлежать этой поездке (аудит 2026-09-12; как в journal)
  if (input.dayId) {
    const day = await db.day.findFirst({ where: { id: input.dayId, tripId }, select: { id: true } });
    if (!day) {
      return NextResponse.json({ error: "day не принадлежит этой поездке" }, { status: 400 });
    }
  }

  if (!isSettlement) {
    if (!memberIds.has(input.paidById)) {
      return NextResponse.json({ error: "paidBy is not a member of this trip" }, { status: 400 });
    }
    if (input.splitWith.some((id) => !memberIds.has(id))) {
      return NextResponse.json({ error: "splitWith contains non-members" }, { status: 400 });
    }
  }

  const data = {
    amount: input.amount,
    category: input.category,
    description: input.description,
    paidById: input.paidById,
    dayId: input.dayId,
    tripId,
    splitWith: input.splitWith.join(","),
    excludeSelf: input.excludeSelf,
    settlementKey: input.settlementKey,
    originalAmount: input.originalAmount,
    originalCurrency: input.originalCurrency,
  };

  let expense;
  if (!isSettlement) {
    expense = await db.expense.create({ data, include: EXPENSE_INCLUDE });
  } else {
    const result = await createSettlement(tripId, memberIds, input, data);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    // Идемпотентный повтор: запись уже была — не эмитим новое событие
    if (result.existing) return NextResponse.json(result.expense);
    expense = result.expense;
  }

  // Символ валюты поездки — для push/ws-уведомления (иначе там жёсткий $)
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { currency: true } });

  await publish(tripId, "expense:added", {
    id: expense.id,
    amount: expense.amount,
    category: expense.category,
    description: expense.description,
    paidByName: expense.paidBy?.name || "Кто-то",
    currencySymbol: currencySymbol(trip?.currency),
    // author for toast text + anti double-toast on the client
    userId: user!.id,
    userName: user!.name || expense.paidBy?.name || "Кто-то",
  });

  return NextResponse.json(expense);
}

type ExpenseWithRefs = Prisma.ExpenseGetPayload<{ include: typeof EXPENSE_INCLUDE }>;
type SettlementResult =
  | { ok: true; existing: boolean; expense: ExpenseWithRefs }
  | { ok: false; status: number; error: string };

// Перевод — в сериализуемой транзакции: проверка «не больше долга» и создание записи не должны
// разъезжаться, когда кредитор нажимает «Перевели» с двух устройств (раньше второй клик создавал
// встречный долг). Конфликт сериализации (P2034) — один повтор, затем 409.
async function createSettlement(
  tripId: string,
  memberIds: Set<string>,
  input: NormalizedExpense,
  data: Prisma.ExpenseUncheckedCreateInput
): Promise<SettlementResult> {
  const recipient = input.splitWith[0];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          // Идемпотентность: тот же ключ в этой поездке — вернуть уже созданное (ключ уникален в рамках поездки)
          const existing = await tx.expense.findFirst({
            where: { settlementKey: input.settlementKey!, tripId },
            include: EXPENSE_INCLUDE,
          });
          if (existing) return { ok: true as const, existing: true, expense: existing };

          const all = await tx.expense.findMany({
            where: { tripId },
            select: { amount: true, paidById: true, splitWith: true, excludeSelf: true },
          });
          const known = new Set([...memberIds, ...expenseUserIds(all)]);
          if (!known.has(input.paidById) || !known.has(recipient)) {
            return { ok: false as const, status: 400, error: "Участники перевода не относятся к этой поездке" };
          }
          // Долг плательщика перед получателем (с неттингом встречных трат и прошлых переводов)
          const check = checkSettlementAgainstDebt(all, input.paidById, recipient, input.amount);
          if (!check.ok) return { ok: false as const, status: check.status, error: check.error };
          const created = await tx.expense.create({ data, include: EXPENSE_INCLUDE });
          return { ok: true as const, existing: false, expense: created };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 }
      );
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      // P2002 — гонка по уникальному ключу: запись уже создана параллельным запросом → отдаём её
      if (code === "P2002" && input.settlementKey) {
        const existing = await db.expense.findFirst({
          where: { settlementKey: input.settlementKey, tripId },
          include: EXPENSE_INCLUDE,
        });
        if (existing) return { ok: true, existing: true, expense: existing };
      }
      // P2034 — конфликт сериализации: параллельный перевод в этой поездке; повторяем один раз
      if (code === "P2034" && attempt === 0) continue;
      if (code === "P2034") {
        return { ok: false, status: 409, error: "Параллельное изменение долгов — обнови экран и повтори" };
      }
      throw e;
    }
  }
  return { ok: false, status: 409, error: "Параллельное изменение долгов — обнови экран и повтори" };
}

// DELETE /api/expenses?id=...
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const expense = await db.expense.findUnique({
    where: { id },
    select: { tripId: true, paidById: true, category: true, splitWith: true },
  });
  if (!expense) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { user, membership, response } = await requireTripEditor(req, expense.tripId);
  if (response) return response;

  // Плательщик, owner поездки, либо получатель перевода (отменить ошибочную отметку «Перевели»)
  const isPayer = expense.paidById === user!.id;
  const isOwner = membership!.role === "owner";
  const isSettlementRecipient =
    expense.category === "settlement" &&
    (expense.splitWith || "").split(",").filter(Boolean).includes(user!.id);
  if (!isPayer && !isOwner && !isSettlementRecipient) {
    return NextResponse.json({ error: "Можно удалять только свои траты" }, { status: 403 });
  }

  await db.expense.delete({ where: { id } });

  await publish(expense.tripId, "expense:deleted", { id });

  return NextResponse.json({ ok: true });
}
