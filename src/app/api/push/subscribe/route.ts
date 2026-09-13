import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { rateLimitMiddleware } from "@/lib/rate-limit";

// POST /api/push/subscribe — сохранить push подписку текущего пользователя
export async function POST(req: NextRequest) {
  try {
    // P0: rate limiting — 30 subscriptions per hour per IP
    const rateLimit = rateLimitMiddleware(req, "push-subscribe", 30, 60 * 60_000);
    if (rateLimit) return rateLimit;

    const { user: authUser, response } = await requireUser(req);
    if (response) return response;
    const userId = authUser!.id;

    const body = await req.json();
    const { subscription } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        { error: "subscription (endpoint + keys) required" },
        { status: 400 }
      );
    }

    // Валидация endpoint: сервер сам ходит по этому адресу (VAPID-запрос),
    // произвольная строка делала из пуша SSRF-примитив (аудит 2026-09-12)
    let endpointHost: string;
    try {
      const u = new URL(subscription.endpoint);
      if (u.protocol !== "https:") {
        return NextResponse.json({ error: "endpoint: только https" }, { status: 400 });
      }
      endpointHost = u.hostname;
    } catch {
      return NextResponse.json({ error: "endpoint: некорректный URL" }, { status: 400 });
    }
    if (
      endpointHost === "localhost" ||
      endpointHost === "127.0.0.1" ||
      endpointHost === "0.0.0.0" ||
      endpointHost.endsWith(".local") ||
      endpointHost.endsWith(".internal") ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(endpointHost)
    ) {
      return NextResponse.json({ error: "endpoint: недопустимый хост" }, { status: 400 });
    }

    const existing = await db.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
    });

    if (existing) {
      // Чужую подписку не перехватываем (аудит 2026-09-12): переassignment
      // отсылал пуш юзера на устройство атакующего / глушил его пуши
      if (existing.userId !== userId) {
        return NextResponse.json({ error: "Эта подписка принадлежит другому пользователю" }, { status: 409 });
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
