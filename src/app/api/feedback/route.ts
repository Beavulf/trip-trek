import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { put as storagePut, StorageError } from "@/lib/storage";
import { userRateLimit } from "@/lib/rate-limit";
import { cleanContextField, MAX_MESSAGE, parseFeedbackType, parseMessageText } from "@/lib/feedback";
import { notifyAdminsOfFeedback } from "@/lib/feedback-server";

// POST /api/feedback — обращение от пользователя: баг, идея, вопрос, жалоба или отзыв.
// multipart/form-data: message (обязателен), type, screen, tripId, viewport, appVersion,
// noContext=1 (не прикладывать сведения об устройстве), file (скриншот).
export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    // 5 отправок в час — форма не для спама; дальше переписка идёт в рамках обращения
    const limited = userRateLimit(req, user!.id, "feedback", 5, 60 * 60_000);
    if (limited) return limited;

    const formData = await req.formData();
    const text = parseMessageText(formData.get("message"), MAX_MESSAGE);
    if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });
    const type = parseFeedbackType(formData.get("type"));
    // Юзер снял галочку «приложить сведения»: сохраняем только текст и скриншот
    const withContext = formData.get("noContext") !== "1";

    // Скриншот опционален; единая политика хранилища (magic bytes, sharp, UUID)
    let screenshotUrl: string | null = null;
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      // Размер до чтения в память (как в photos/avatar)
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Скриншот слишком большой (макс 5MB)" }, { status: 413 });
      }
      try {
        const res = await storagePut({ data: Buffer.from(await file.arrayBuffer()), kind: "feedback" });
        screenshotUrl = res.url;
      } catch (e) {
        if (e instanceof StorageError) {
          return NextResponse.json({ error: e.message }, { status: e.status });
        }
        throw e;
      }
    }

    const feedback = await db.feedback.create({
      data: {
        userId: user!.id,
        type,
        message: text.message,
        screenshotUrl,
        screen: withContext ? cleanContextField(formData.get("screen"), 120) : null,
        tripId: withContext ? cleanContextField(formData.get("tripId"), 64) : null,
        viewport: withContext ? cleanContextField(formData.get("viewport"), 40) : null,
        appVersion: withContext ? cleanContextField(formData.get("appVersion"), 40) : null,
        userAgent: withContext ? req.headers.get("user-agent")?.slice(0, 300) || null : null,
      },
      select: { id: true },
    });

    // Админы узнают сразу (колокольчик + пуш), а не когда сами откроют штаб
    void notifyAdminsOfFeedback({
      feedbackId: feedback.id,
      type,
      authorName: user!.name || "Пользователь",
      authorId: user!.id,
      text: text.message,
      kind: "new",
    });

    return NextResponse.json({ id: feedback.id, ok: true });
  } catch (e) {
    // Аккаунт удалён, пока JWT жив: сессия протухнет на следующем custom-session,
    // здесь просто просим перевойти вместо безликого 500
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return NextResponse.json({ error: "Войди заново и попробуй ещё раз" }, { status: 401 });
    }
    console.error("Feedback submit error:", e);
    return NextResponse.json({ error: "Не удалось отправить. Попробуй ещё раз" }, { status: 500 });
  }
}
