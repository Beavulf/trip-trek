import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitCheck, clientIp } from "@/lib/rate-limit";
import { isPlausibleEmail, MAX_GUEST_MESSAGE, parseMessageText } from "@/lib/feedback";
import { notifyAdminsOfFeedback } from "@/lib/feedback-server";

// POST /api/feedback/guest — обращение без входа (забыл пароль, не приходит письмо, не работает код).
// Тело JSON: { message, email, website }. `website` — приманка для ботов: человек его не видит
// и не заполняет. Публичный роут, поэтому лимиты строже, чем у обращений из аккаунта.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // 3 письма в час и 10 в сутки с одного адреса: за CGNAT мобильных хватает, спам-волна — нет
  if (!rateLimitCheck(`feedback-guest:h:${ip}`, 3, 60 * 60_000) || !rateLimitCheck(`feedback-guest:d:${ip}`, 10, 24 * 60 * 60_000)) {
    return NextResponse.json({ error: "Слишком много обращений. Попробуйте позже" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { message?: unknown; email?: unknown; website?: unknown };

  // Бот заполнил скрытое поле: отвечаем «успехом», чтобы он не подбирал обход, но ничего не пишем
  if (typeof body.website === "string" && body.website.trim()) return NextResponse.json({ ok: true });

  const text = parseMessageText(body.message, MAX_GUEST_MESSAGE);
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ error: "Укажите email, на который нам ответить" }, { status: 400 });
  }

  const feedback = await db.feedback.create({
    data: {
      userId: null,
      type: "question",
      message: text.message,
      contactEmail: email,
      screen: "/login",
      userAgent: req.headers.get("user-agent")?.slice(0, 300) || null,
    },
    select: { id: true },
  });

  void notifyAdminsOfFeedback({
    feedbackId: feedback.id,
    type: "question",
    authorName: `гость (${email})`,
    text: text.message,
    kind: "new",
  });

  return NextResponse.json({ ok: true });
}
