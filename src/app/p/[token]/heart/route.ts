import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /p/<token>/heart — гостевое сердечко на публичной странице.
// Анонимно и без идентичности: тап = ±1 к счётчику Trip.shareHearts.
// {undo: true} — забрать своё сердечко (−1, ниже нуля не идём).
// Анти-спам двусторонний: с устройства держится максимум ±1 (localStorage,
// контроль на клиенте), по IP — 10/ч на любые действия с сердечком.

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const limited = rateLimitMiddleware(req, "share-heart", 10, 60 * 60_000);
  if (limited) return limited;

  const { token } = await ctx.params;
  const trip = await db.trip.findFirst({
    where: { shareToken: token, shareEnabled: true },
    select: { id: true },
  });
  if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { undo?: boolean };

  if (body.undo) {
    // gt-гвард: декремент только если есть что забирать — счётчик не уходит в минус
    const updated = await db.trip.updateMany({
      where: { id: trip.id, shareHearts: { gt: 0 } },
      data: { shareHearts: { decrement: 1 } },
    });
    if (updated.count === 0) {
      const fresh = await db.trip.findUnique({ where: { id: trip.id }, select: { shareHearts: true } });
      return NextResponse.json({ hearts: fresh?.shareHearts ?? 0, undo: false });
    }
    const fresh = await db.trip.findUnique({ where: { id: trip.id }, select: { shareHearts: true } });
    return NextResponse.json({ hearts: fresh?.shareHearts ?? 0, undo: true });
  }

  const updated = await db.trip.update({
    where: { id: trip.id },
    data: { shareHearts: { increment: 1 } },
    select: { shareHearts: true },
  });
  return NextResponse.json({ hearts: updated.shareHearts, undo: false });
}
