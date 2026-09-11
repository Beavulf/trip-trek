import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { notifyUser } from "@/lib/notify";
import { publish } from "@/lib/ws-bus";
import { userRateLimit } from "@/lib/rate-limit";

// POST /api/participants/leave {tripId} — выйти из поездки по собственной воле.
// Владелец выйти не может: поездка останется без хозяина. Сначала передай
// владение (или удали поездку). Остальным участникам приходит событие в ленту,
// владельцу — уведомление.
export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;
  const limited = userRateLimit(req, user!.id, "participants-leave", 10, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { tripId } = body as { tripId?: string };
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const member = await db.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: user!.id } },
    include: { trip: { select: { title: true } } },
  });
  if (!member) return NextResponse.json({ error: "Вы не состоите в этой поездке" }, { status: 404 });
  if (member.role === "owner") {
    return NextResponse.json(
      { error: "Владелец не может выйти из поездки. Сначала передайте владение другому участнику." },
      { status: 400 }
    );
  }

  await db.tripMember.delete({ where: { id: member.id } });
  publish(tripId, "trip:updated", {});

  // Владельцу — уведомление, что участник ушёл
  const owner = await db.tripMember.findFirst({ where: { tripId, role: "owner" } });
  if (owner) {
    await notifyUser(owner.userId, {
      type: "member_left",
      title: `${member.displayName} покинул поездку «${member.trip.title}»`,
      body: "Состав поездки изменился.",
    });
  }

  return NextResponse.json({ ok: true });
}
