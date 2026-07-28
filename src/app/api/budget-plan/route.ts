import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitWS } from "@/lib/ws-emit";

// GET /api/budget-plan?tripId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const plans = await db.budgetPlan.findMany({ where: tripId ? { tripId } : undefined });
  return NextResponse.json(plans);
}

// PATCH
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { category, amount, tripId } = body;
  if (!category || typeof amount !== "number" || !tripId) {
    return NextResponse.json({ error: "category, amount, tripId required" }, { status: 400 });
  }
  const plan = await db.budgetPlan.upsert({
    where: { tripId_category: { tripId, category } },
    create: { tripId, category, amount },
    update: { amount },
  });
  emitWS("budget:updated", tripId, {});
  return NextResponse.json(plan);
}
