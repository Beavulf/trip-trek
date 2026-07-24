import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/photos/geo — все фото с координатами (для карты)
export async function GET() {
  const photos = await db.photo.findMany({
    where: {
      AND: [
        { lat: { not: null } },
        { lng: { not: null } },
      ],
    },
    orderBy: { takenAt: "desc" },
    include: {
      participant: true,
      day: { select: { dayNumber: true, city: true, cityKey: true } },
    },
  });
  return NextResponse.json(photos);
}
