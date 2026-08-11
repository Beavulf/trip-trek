import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";
import { requireTripMember } from "@/lib/api-auth";

// GET /api/expenses?tripId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json([]);

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  // Include day (для UI «День N» в ExpenseRow)
  const expenses = await db.expense.findMany({
    where: { tripId },
    include: {
      paidBy: { select: { id: true, name: true, emoji: true, color: true } },
      day: { select: { dayNumber: true, city: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(expenses);
}

// POST /api/expenses — добавить трату
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { amount, category, description, paidById, dayId, tripId, splitWith, excludeSelf, settlementKey } = body;
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;
  if (!category || !description || !paidById || !tripId) {
    return NextResponse.json({ error: "category, description, paidById, tripId required" }, { status: 400 });
  }
  const parsedAmount = typeof amount === "number" ? amount : parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 1000000) {
    return NextResponse.json({ error: "amount must be positive (max 1000000)" }, { status: 400 });
  }
  if (typeof description !== "string" || !description.trim() || description.length > 500) {
    return NextResponse.json({ error: "description required (max 500 chars)" }, { status: 400 });
  }

  // P1 #14: проверяем что paidById и splitWith — участники поездки
  const memberIds = (await db.tripMember.findMany({
    where: { tripId },
    select: { userId: true },
  })).map(m => m.userId);
  if (!memberIds.includes(paidById)) {
    return NextResponse.json({ error: "paidBy is not a member of this trip" }, { status: 400 });
  }
  const splitArr: string[] = Array.isArray(splitWith)
    ? splitWith.filter((id: unknown): id is string => typeof id === "string")
    : [];
  const invalidSplit = splitArr.filter((id: string) => !memberIds.includes(id));
  if (invalidSplit.length > 0) {
    return NextResponse.json({ error: "splitWith contains non-members" }, { status: 400 });
  }

  // P0 #3: идемпотентность settlement — если settlementKey передан,
  // проверяем есть ли уже запись с этим ключом. Если да — возвращаем её.
  if (settlementKey && typeof settlementKey === "string") {
    const existing = await db.expense.findUnique({
      where: { settlementKey },
      include: {
        paidBy: { select: { id: true, name: true, emoji: true, color: true } },
        day: { select: { dayNumber: true, city: true } },
      },
    });
    if (existing) {
      // Идемпотентный ответ — не создаём дубль, не эмитим новое событие
      return NextResponse.json(existing);
    }
  }

  const expense = await db.expense.create({
    data: {
      amount: parsedAmount,
      category,
      description: description.trim().slice(0, 500),
      paidById,
      dayId: dayId || null,
      tripId,
      splitWith: splitArr.join(","),
      excludeSelf: !!excludeSelf,
      settlementKey: settlementKey || null,
    },
    include: {
      paidBy: { select: { id: true, name: true, emoji: true, color: true } },
      day: { select: { dayNumber: true, city: true } },
    },
  });

  await emitWS("expense:added", tripId, {
    id: expense.id,
    amount: expense.amount,
    category: expense.category,
    description: expense.description,
    paidByName: expense.paidBy?.name || "Кто-то",
  });

  return NextResponse.json(expense);
}

// DELETE /api/expenses?id=...
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const expense = await db.expense.findUnique({ where: { id }, select: { tripId: true } });
  if (!expense) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { response } = await requireTripMember(req, expense.tripId);
  if (response) return response;

  await db.expense.delete({ where: { id } });

  await emitWS("expense:deleted", expense.tripId, { id });

  return NextResponse.json({ ok: true });
}
