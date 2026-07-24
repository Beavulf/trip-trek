import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/trip/budget — обновить общий бюджет поездки
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { totalBudget } = body;
  if (typeof totalBudget !== "number" || totalBudget < 0) {
    return NextResponse.json({ error: "totalBudget must be a positive number" }, { status: 400 });
  }
  const settings = await db.tripSettings.update({
    where: { id: "default" },
    data: { totalBudget },
  });
  return NextResponse.json(settings);
}
