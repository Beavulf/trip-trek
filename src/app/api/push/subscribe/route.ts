import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";

// POST /api/push/subscribe — сохранить push подписку текущего пользователя
export async function POST(req: NextRequest) {
  try {
    const { user: authUser, response } = await requireUser(req);
    if (response) return response;
    const userId = authUser!.id;

    const body = await req.json();
    const { subscription } = body;

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: "subscription required" }, { status: 400 });
    }

    const existing = await db.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
    });

    if (existing) {
      if (existing.userId !== userId) {
        await db.pushSubscription.update({
          where: { endpoint: subscription.endpoint },
          data: { userId },
        });
      }
      return NextResponse.json({ ok: true, existed: true });
    }

    await db.pushSubscription.create({
      data: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh || "",
        auth: subscription.keys?.auth || "",
      },
    });

    return NextResponse.json({ ok: true, created: true });
  } catch (e) {
    console.error("Push subscribe error:", e);
    return NextResponse.json({ error: "Subscribe failed" }, { status: 500 });
  }
}

// DELETE /api/push/subscribe — удалить свою подписку
export async function DELETE(req: NextRequest) {
  const { user: authUser, response } = await requireUser(req);
  if (response) return response;
  const userId = authUser!.id;

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");
  const all = searchParams.get("all");

  if (all === "1" || all === "true") {
    try {
      await db.pushSubscription.deleteMany({ where: { userId } });
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ ok: true });
    }
  }

  if (!endpoint) {
    return NextResponse.json({ error: "endpoint or all=1 required" }, { status: 400 });
  }

  try {
    const sub = await db.pushSubscription.findUnique({ where: { endpoint } });
    if (sub && sub.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await db.pushSubscription.delete({ where: { endpoint } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, notFound: true });
  }
}
