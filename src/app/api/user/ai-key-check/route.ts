import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { resolveAiConfig, openaiChatUrl, maskKey, DEFAULT_AI_MODEL } from "@/lib/ai-key";
import { userRateLimit } from "@/lib/rate-limit";

// POST /api/user/ai-key-check — проверка ИИ-ключа (BYOK).
// Минимальный запрос к провайдеру, чтобы юзер узнал, что ключ живой,
// сразу при вставке, а не при первой генерации фраз.
// Конфиг тот же, что у реальных ИИ-функций: ключ юзера → админ → env.
export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const limited = userRateLimit(req, user!.id, "ai-key-check", 5, 60_000);
  if (limited) return limited;

  const cfg = await resolveAiConfig(user!.id);

  // Проверяем ТОЛЬКО свой ключ юзера. Общий (админ/env) не греем чужими
  // запросами и не показываем его телеметрию/хвост — у админа для проверки
  // общего конфига есть admin/settings/test (аудит 2026-09-12).
  if (cfg.source !== "user") {
    return NextResponse.json({
      ok: Boolean(cfg.key),
      checked: false,
      source: cfg.source,
      message: cfg.key
        ? "Свой ключ не задан — используется общий, его проверка не выполнялась."
        : "Ключ не задан — ни свой, ни общий.",
    });
  }
  if (!cfg.key) {
    return NextResponse.json({ ok: false, error: "Ключ не задан" }, { status: 400 });
  }

  const base = openaiChatUrl(cfg.baseUrl);
  const model = cfg.model ?? DEFAULT_AI_MODEL;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let r: Response;
    try {
      r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        // как и в runAi: редирект унёс бы Bearer-ключ на чужой хост
        redirect: "error",
        headers: {
          Authorization: `Bearer ${cfg.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Ответь ровно одним словом: ок" }],
          // без temperature: часть reasoning-моделей отклоняет != 1 и проверки
          // ложных «ключ не работает» быть не должно
          max_tokens: 200,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!r.ok) {
      const text = (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
      if (r.status === 401 || r.status === 403) {
        return NextResponse.json({
          ok: false,
          error: `Провайдер отклонил ключ (${r.status}). Проверь ключ и что он подходит к модели «${model}».`,
        });
      }
      if (r.status === 404) {
        return NextResponse.json({
          ok: false,
          error: `Адрес API не найден (404). Для модели «${model}» Base URL обычно должен включать /v1 — проверь свой адрес в профиле или адрес общего конфига у админа.`,
        });
      }
      return NextResponse.json({
        ok: false,
        error: `Провайдер вернул ошибку ${r.status}${text ? `: ${text}` : ""}`,
      });
    }

    const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({
      ok: true,
      model,
      tail: maskKey(cfg.key),
      source: cfg.source,
      reply: reply.slice(0, 40),
    });
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
    return NextResponse.json({
      ok: false,
      error: aborted
        ? "Провайдер не ответил за 20 секунд — попробуй ещё раз"
        : "Не удалось связаться с провайдером — проверь Base URL и соединение",
    });
  }
}
