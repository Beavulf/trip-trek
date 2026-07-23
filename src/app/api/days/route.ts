import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/days — все дни с местами и фото
export async function GET() {
  const days = await db.day.findMany({
    orderBy: { dayNumber: "asc" },
    include: {
      places: { orderBy: { order: "asc" } },
      photos: { orderBy: { takenAt: "desc" }, take: 8 },
      _count: { select: { places: true, photos: true, expenses: true } },
    },
  });
  return NextResponse.json(days);
}
