import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /p/<token>/heart — гостевое сердечко на публичной странице.
// Анонимно и без идентичности: один тап = +1 к счётчику Trip.shareHearts.
// Анти-спам — лимит по IP (10/ч): искренние поздравления не режет,
// накрутку скриптом делает бессмысленной.

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limited = rateLimitMiddleware(req, "share-heart", 10, 60 * 60_000);
  if (limited) return limited;

  const { token } = await ctx.params;
  const trip = await db.trip.findFirst({
    where: { shareToken: token, shareEnabled: true },
    select: { id: true },
  });
  if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });

  const updated = await db.trip.update({
    where: { id: trip.id },
    data: { shareHearts: { increment: 1 } },
    select: { shareHearts: true },
  });
  return NextResponse.json({ hearts: updated.shareHearts });
}
