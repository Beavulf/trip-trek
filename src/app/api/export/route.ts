import { NextRequest, NextResponse } from "next/server";
import { requireTripMember } from "@/lib/api-auth";
import { buildTripExport } from "@/lib/trip-export";

// GET /api/export?tripId=... — экспорт данных поездки в JSON
// P0 #2: auth + membership (was open — anyone with tripId could export).
// Полный дамп (включая inviteCode) — функция владельца, участникам 403.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });
  const { membership, response } = await requireTripMember(req, tripId);
  if (response) return response;
  if (membership!.role !== "owner") {
    return NextResponse.json({ error: "Бэкап скачивает только владелец поездки" }, { status: 403 });
  }

  const payload = await buildTripExport(tripId);
  if (!payload) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });
  return NextResponse.json(payload);
}
