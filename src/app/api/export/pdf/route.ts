import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { buildRoutePdf } from "@/lib/pdf/route-pdf";

// GET /api/export/pdf?tripId=... — маршрут поездки одним PDF (офлайн-просмотр).
// В отличие от JSON-бэкапа /api/export доступен всем участникам: это те же данные,
// что читает вкладка «Маршрут», без inviteCode и полного дампа.
export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { title: true, destination: true, currency: true, startDate: true, endDate: true },
  });
  if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });

  // Выборка зеркалит GET /api/route (дни по порядку + места по order) — src/app/api/route/route.ts
  const days = await db.day.findMany({
    where: { tripId },
    orderBy: { dayNumber: "asc" },
    select: {
      dayNumber: true,
      date: true,
      city: true,
      title: true,
      summary: true,
      accentColor: true,
      places: {
        where: { tripId },
        orderBy: { order: "asc" },
        select: { name: true, category: true, timeOfDay: true, address: true, budget: true, description: true, notes: true },
      },
    },
  });

  if (!days.some((d) => d.places.length > 0)) {
    return NextResponse.json({ error: "Маршрут пуст — добавь дни и места" }, { status: 400 });
  }

  try {
    const bytes = await buildRoutePdf({
      title: trip.title,
      destination: trip.destination,
      currency: trip.currency,
      startDate: trip.startDate.toISOString(),
      endDate: trip.endDate ? trip.endDate.toISOString() : null,
      generatedAt: new Date(),
      // prisma отдаёт Date — контракту билдера нужны ISO-строки
      days: days.map((d) => ({ ...d, date: d.date.toISOString().slice(0, 10) })),
    });
    // filename* (RFC 5987) даёт кириллическое имя, filename — ASCII-fallback
    const safeName = `triptrek-${trip.title.replace(/[^\p{L}\p{N}-]+/gu, "-").slice(0, 40)}.pdf`;
    // pdf-lib отдаёт Uint8Array<ArrayBufferLike>, а BodyInit в TS >= 5.7 требует
    // буфер именно ArrayBuffer — копируем в свежий типизированный массив
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="triptrek-route.pdf"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      },
    });
  } catch (e) {
    logger.error("pdf export failed", { tripId, error: String(e) });
    return NextResponse.json({ error: "Не удалось сформировать PDF" }, { status: 500 });
  }
}
