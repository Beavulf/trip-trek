import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";

// GET /api/expenses?tripId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const where = tripId ? { tripId } : undefined;

  const expenses = await db.expense.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { paidBy: true, day: { select: { dayNumber: true, city: true } } },
  });
  return NextResponse.json(expenses);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { amount, category, description, paidById, dayId, tripId } = body;
  if (!amount || !category || !description || !paidById || !tripId) {
    return NextResponse.json({ error: "amount, category, description, paidById, tripId required" }, { status: 400 });
  }
  const expense = await db.expense.create({
    data: { amount: parseFloat(amount), category, description, paidById, tripId, dayId: dayId || null },
    include: { paidBy: true, day: true },
  });
  return NextResponse.json(expense);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.expense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
