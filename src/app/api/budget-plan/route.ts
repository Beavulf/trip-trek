import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/budget-plan
export async function GET() {
  const plans = await db.budgetPlan.findMany();
  return NextResponse.json(plans);
}

// PATCH — обновить плановую сумму
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { category, amount } = body;
  if (!category || typeof amount !== "number") {
    return NextResponse.json({ error: "category, amount required" }, { status: 400 });
  }
  const plan = await db.budgetPlan.upsert({
    where: { category },
    create: { category, amount },
    update: { amount },
  });
  return NextResponse.json(plan);
}
