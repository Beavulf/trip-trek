import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publish } from "@/lib/ws-bus";
import { requireTripMember, requireTripEditor } from "@/lib/api-auth";
import { EXPENSE_CATEGORIES } from "@/lib/types";

// GET /api/budget-plan?tripId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json([]);
  const { response } = await requireTripMember(req, tripId);
  if (response) return response;
  const plans = await db.budgetPlan.findMany({ where: { tripId } });
  return NextResponse.json(plans);
}

// PATCH
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { category, amount, tripId } = body ?? {};
  if (typeof tripId !== "string" || !tripId) {
    return NextResponse.json({ error: "category, amount, tripId required" }, { status: 400 });
  }
  const { response } = await requireTripEditor(req, tripId);
  if (response) return response;
  if (typeof category !== "string" || !(category in EXPENSE_CATEGORIES) || typeof amount !== "number") {
    return NextResponse.json({ error: "category, amount, tripId required" }, { status: 400 });
  }
  // План — конечное неотрицательное число (раньше принимались отрицательные и любые строки категорий)
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) {
    return NextResponse.json({ error: "amount must be between 0 and 1000000000" }, { status: 400 });
  }
  const plan = await db.budgetPlan.upsert({
    where: { tripId_category: { tripId, category } },
    create: { tripId, category, amount },
    update: { amount },
  });
  publish(tripId, "budget:updated", {});
  return NextResponse.json(plan);
}
