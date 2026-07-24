import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/expenses — все траты
export async function GET() {
  const expenses = await db.expense.findMany({
    orderBy: { createdAt: "desc" },
    include: { paidBy: true, day: { select: { dayNumber: true, city: true } } },
  });
  return NextResponse.json(expenses);
}

// POST — добавить трату
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { amount, category, description, paidById, dayId } = body;
  if (!amount || !category || !description || !paidById) {
    return NextResponse.json({ error: "amount, category, description, paidById required" }, { status: 400 });
  }
  const expense = await db.expense.create({
    data: { amount: parseFloat(amount), category, description, paidById, dayId: dayId || null },
    include: { paidBy: true, day: true },
  });
  return NextResponse.json(expense);
}

// DELETE
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.expense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
