import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";

// GET /api/expenses?tripId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json([]);

  const expenses = await db.expense.findMany({
    where: { tripId },
    include: {
      paidBy: { select: { id: true, name: true, emoji: true, color: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(expenses);
}

// POST /api/expenses — добавить трату
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { amount, category, description, paidById, dayId, tripId } = body;
  if (!amount || !category || !description || !paidById || !tripId) {
    return NextResponse.json({ error: "amount, category, description, paidById, tripId required" }, { status: 400 });
  }

  const expense = await db.expense.create({
    data: {
      amount: parseFloat(amount),
      category,
      description,
      paidById,
      dayId: dayId || null,
      tripId,
    },
    include: {
      paidBy: { select: { id: true, name: true, emoji: true, color: true } },
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

  await db.expense.delete({ where: { id } });

  await emitWS("expense:deleted", expense.tripId, { id });

  return NextResponse.json({ ok: true });
}
