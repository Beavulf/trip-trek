import { NextRequest, NextResponse } from "next/server";

// POST /api/push/subscribe — регистрация push-подписки
// (В реальном продакшене нужен VAPID ключ + web-push библиотека)
// Пока храним подписки в памяти (для dev), в проде — в БД

const subscriptions: PushSubscription[] = [];

export async function POST(req: NextRequest) {
  try {
    const sub = await req.json();
    if (sub?.endpoint) {
      subscriptions.push(sub);
      console.log(`[Push] New subscription: ${sub.endpoint.slice(0, 50)}...`);
    }
    return NextResponse.json({ success: true, count: subscriptions.length });
  } catch {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }
}

// POST /api/push/send — отправка push-уведомления (вызывается из server.ts /emit)
export async function PUT(req: NextRequest) {
  try {
    const { message, title, tag, url } = await req.json();
    
    // В реальном продакшене — web-push.sendNotification(sub, JSON.stringify({message, title}))
    // Сейчас просто логируем
    console.log(`[Push] Would send: ${title} — ${message}`);
    
    return NextResponse.json({ success: true, sent: subscriptions.length });
  } catch {
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}

// GET /api/push/count — количество подписок
export async function GET() {
  return NextResponse.json({ count: subscriptions.length });
}
