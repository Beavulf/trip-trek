import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/push/subscribe — сохранить push подписку пользователя
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, subscription } = body;

    if (!userId || !subscription || !subscription.endpoint) {
      return NextResponse.json({ error: "userId, subscription required" }, { status: 400 });
    }

    // Проверяем не существует ли уже эта подписка
    const existing = await db.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
    });

    if (existing) {
      // Обновляем если сменился пользователь
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

// DELETE /api/push/subscribe — удалить подписку
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");

  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  try {
    await db.pushSubscription.delete({
      where: { endpoint },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, notFound: true });
  }
}
