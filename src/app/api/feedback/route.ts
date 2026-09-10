import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { put as storagePut, StorageError } from "@/lib/storage";
import { userRateLimit } from "@/lib/rate-limit";

const FEEDBACK_TYPES = ["bug", "idea", "question"] as const;
const MAX_MESSAGE = 4000;

// POST /api/feedback — баг-репорт / идея / вопрос от пользователя.
// multipart/form-data: message (обязателен), type, pageUrl, tripId, file (скриншот).
export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireUser(req);
    if (response) return response;

    // 5 отправок в час — форма не для спама; StorageError об ошибках файла
    const limited = userRateLimit(req, user!.id, "feedback", 5, 60 * 60_000);
    if (limited) return limited;

    const formData = await req.formData();
    const message = String(formData.get("message") || "").trim();
    const typeRaw = String(formData.get("type") || "bug");
    const type = (FEEDBACK_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : "bug";
    const pageUrl = String(formData.get("pageUrl") || "").slice(0, 500) || null;
    const tripId = String(formData.get("tripId") || "").slice(0, 64) || null;

    if (!message) {
      return NextResponse.json({ error: "Опиши, что случилось" }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE) {
      return NextResponse.json({ error: `Максимум ${MAX_MESSAGE} символов` }, { status: 400 });
    }

    // Скриншот опционален; единая политика хранилища (magic bytes, sharp, UUID)
    let screenshotUrl: string | null = null;
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
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
        message,
        screenshotUrl,
        pageUrl,
        tripId,
        userAgent: req.headers.get("user-agent")?.slice(0, 300) || null,
      },
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
