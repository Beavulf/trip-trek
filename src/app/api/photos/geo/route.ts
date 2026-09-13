import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";

// GET /api/photos/geo?tripId=... — фото с координатами для карты (по поездке)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json([]);

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const photos = await db.photo.findMany({
    where: {
      tripId,
      AND: [
        { lat: { not: null } },
        { lng: { not: null } },
      ],
    },
    orderBy: { takenAt: "desc" },
    // select маркерных полей: раньше отдавались полные строки фото без лимита,
    // а карте нужны только координаты и миниатюра (аудит перфоманса 2026-09-13)
    take: 1000,
    select: {
      id: true,
      lat: true,
      lng: true,
      url: true,
      thumbUrl: true,
      caption: true,
      address: true,
      placeId: true,
      dayId: true,
      user: { select: { id: true, name: true, emoji: true, color: true } },
      day: { select: { dayNumber: true, city: true, cityKey: true } },
    },
  });
  return NextResponse.json(photos);
}
