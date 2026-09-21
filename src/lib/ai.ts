import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userRateLimit } from "@/lib/rate-limit";
import { resolveAiConfig, openaiChatUrl, DEFAULT_AI_MODEL, type AiKeySource } from "@/lib/ai-key";
import { AI_FEATURES, parseAiUsage, utcMidnight, isSpendOverLimit, type AiFeature, type AiUsageTokens } from "@/lib/ai-usage";
import { notifyUser } from "@/lib/notify";
import { isPremiumUser } from "@/lib/premium";

/**
 * Единая точка всех ИИ-вызовов. Новая фича = запись в AI_FEATURES + промпты
 * в своём роуте; транспорт, лимит, учёт и алерты здесь, чтобы их невозможно
 * было забыть. Учёт и алерты — fire-and-forget: сбой логирования не роняет
 * фичу (плавающие промисы под Bun без .catch = unhandled-rejection, грабли server.ts).
 *
 * Почему не outbound.ts: он ретраит (платные вызовы нельзя дёргать дважды),
 * схлопывает ошибки в null (нужен HTTP-статус для учёта) и не умеет
 * redirect:"error" (защита от увода Bearer-ключа на чужой хост через 30x).
 */

export interface RunAiInput {
  req: NextRequest; // нужен общему лимитеру (429 + Retry-After как у всех роутов)
  userId: string;
  tripId?: string | null;
  feature: AiFeature;
  system: string;
  prompt: string;
  /** Перекрывает температуру фичи из реестра. */
  temperature?: number;
}

export type AiFailReason = "blocked" | "rate_limited" | "no_key" | "provider" | "empty";

export type AiResult =
  | { ok: true; text: string; source: AiKeySource; model: string; usage: AiUsageTokens; durationMs: number }
  | {
      ok: false;
      reason: AiFailReason;
      /** HTTP-статус провайдера для reason:"provider". */
      status?: number;
      /** Готовый 429-ответ общего лимитера — роут возвращает его как есть. */
      limitResponse?: NextResponse;
    };

/**
 * Единый маппер неудач runAi в HTTP-ответ: 429 лимитера — как есть (Retry-After),
 * блок — 403, нет ключа — 503, остальное (провайдер/пусто) — 502. Тексты своих
 * 503/403 фича передаёт сама — они видны юзеру в toast как есть.
 */
export function aiFailResponse(
  ai: Extract<AiResult, { ok: false }>,
  texts: { blocked: string; unavailable: string; format?: string }
): NextResponse {
  if (ai.reason === "rate_limited" && ai.limitResponse) return ai.limitResponse;
  if (ai.reason === "blocked") return NextResponse.json({ error: texts.blocked }, { status: 403 });
  if (ai.reason === "no_key") return NextResponse.json({ error: texts.unavailable }, { status: 503 });
  return NextResponse.json({ error: texts.format ?? "ИИ не смог ответить — попробуй ещё раз" }, { status: 502 });
}

export async function runAi(input: RunAiInput): Promise<AiResult> {
  const def = AI_FEATURES[input.feature];
  const cfg = await resolveAiConfig(input.userId);

  // Блок админа — полный: любой источник ключа. Проверка до лимитера,
  // чтобы заблокированный не тратил и слоты лимита.
  if (cfg.aiBlocked) return { ok: false, reason: "blocked" };

  // Шов премиум-гейта: фичи с access "premium-or-byok" требуют премиум или свой
  // ключ. Запрос плана только когда гейт реально включён — сейчас не включён ни у кого.
  if (def.access !== "all" && cfg.source !== "user") {
    const u = await db.user.findUnique({ where: { id: input.userId }, select: { plan: true, planExpiry: true } });
    if (!u || !isPremiumUser(u)) return { ok: false, reason: "no_key" };
  }

  const limited = userRateLimit(input.req, `${input.userId}:${input.tripId ?? "-"}`, `ai:${input.feature}`, def.limit.max, def.limit.windowMs);
  if (limited) return { ok: false, reason: "rate_limited", limitResponse: limited };

  if (!cfg.key) return { ok: false, reason: "no_key" };

  const model = cfg.model ?? DEFAULT_AI_MODEL;
  const base = openaiChatUrl(cfg.baseUrl);
  const startedAt = Date.now();

  // Таймер живёт до конца чтения тела: провайдер может отдать заголовки
  // и замереть на потоке — abort должен разорвать и чтение json тоже.
  const controller = new AbortController();
  // Таймаут — свойство фичи: творческий текст на «размышляющих» моделях идёт
  // дольше минуты (см. комментарий к timeoutMs в ai-usage.ts).
  const timeout = setTimeout(() => controller.abort(), def.timeoutMs ?? 60_000);

  let r: Response;
  try {
    r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      // Провайдерские эндпоинты никогда не редиректят: разрешение редиректа
      // позволило бы утащить Bearer-ключ на чужой хост через 30x.
      redirect: "error",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        temperature: input.temperature ?? def.temperature,
      }),
    });
  } catch (e) {
    clearTimeout(timeout);
    const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
    void logAiUsage({
      userId: input.userId,
      tripId: input.tripId ?? null,
      feature: input.feature,
      keySource: cfg.source,
      model,
      ok: false,
      error: aborted ? "timeout" : "network",
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, reason: "provider" };
  }

  if (!r.ok) {
    clearTimeout(timeout);
    const t = await r.text().catch(() => "");
    console.error(`[ai:${input.feature}] провайдер ${r.status}: ${t.slice(0, 200)}`);
    void logAiUsage({
      userId: input.userId,
      tripId: input.tripId ?? null,
      feature: input.feature,
      keySource: cfg.source,
      model,
      ok: false,
      error: `http_${r.status}`.slice(0, 32),
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, reason: "provider", status: r.status };
  }

  const data = (await r.json().catch(() => null).finally(() => clearTimeout(timeout))) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  } | null;
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    void logAiUsage({
      userId: input.userId,
      tripId: input.tripId ?? null,
      feature: input.feature,
      keySource: cfg.source,
      model,
      ok: false,
      error: "empty",
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, reason: "empty" };
  }

  const usage = parseAiUsage(data);
  const durationMs = Date.now() - startedAt;
  // finish_reason=length → провайдер обрезал ответ лимитом вывода: телеметрии
  // это важнее юзеру (решение о max_tokens — по реальным данным, гипотетический
  // cap рвал бы reasoning-моделям их же «размышления»)
  const truncated = choice?.finish_reason === "length";
  // Алерт строго ПОСЛЕ записи текущего вызова: иначе агрегат не видит
  // только что сделанный вызов и порог срабатывает через раз.
  void logAiUsage({
    userId: input.userId,
    tripId: input.tripId ?? null,
    feature: input.feature,
    keySource: cfg.source,
    model,
    ok: true,
    usage,
    error: truncated ? "truncated" : undefined,
    durationMs,
  })
    .then(() => maybeAlertSpend(input.userId))
    .catch(() => {});

  return { ok: true, text: content, source: cfg.source, model, usage, durationMs };
}

// ─── Учёт (fire-and-forget, никогда не бросает) ─────────────────────────────

interface AiUsageLog {
  userId: string;
  tripId: string | null;
  feature: AiFeature;
  keySource: AiKeySource;
  model: string;
  ok: boolean;
  usage?: AiUsageTokens;
  error?: string;
  durationMs: number;
}

/** Запись в AiUsage. Только метаданные: промпты и ответы не пишем никогда. */
async function logAiUsage(row: AiUsageLog): Promise<void> {
  try {
    await db.aiUsage.create({
      data: {
        userId: row.userId,
        tripId: row.tripId,
        feature: row.feature,
        keySource: row.keySource,
        model: row.model,
        promptTokens: row.usage?.promptTokens ?? 0,
        completionTokens: row.usage?.completionTokens ?? 0,
        durationMs: row.durationMs,
        ok: row.ok,
        error: row.error ?? null,
      },
    });
  } catch (e) {
    console.error(`[ai] не записали usage (${row.feature}):`, e);
  }
}

/**
 * Алерт «нестандартные траты»: суточный агрегат юзера против порогов из
 * AppSettings. Дедуп «1 раз в UTC-сутки» — атомарный клейм aiAlertedAt:
 * две параллельных генерации дают ровно одно уведомление, в полночь окно
 * сбрасывается само (сравнение «< начала суток»).
 */
async function maybeAlertSpend(userId: string): Promise<void> {
  try {
    const limits = await db.appSettings.findUnique({
      where: { id: "app" },
      select: { aiAlertCallsPerDay: true, aiAlertTokensPerDay: true },
    });
    const callsLimit = limits?.aiAlertCallsPerDay ?? 0;
    const tokensLimit = limits?.aiAlertTokensPerDay ?? 0;
    if (callsLimit <= 0 && tokensLimit <= 0) return; // алерты выключены — самый частый путь

    const midnight = utcMidnight();
    const [agg, user] = await Promise.all([
      db.aiUsage.aggregate({
        where: { userId, createdAt: { gte: midnight } },
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
      }),
      db.user.findUnique({ where: { id: userId }, select: { name: true, aiAlertedAt: true } }),
    ]);
    if (!user) return;

    const callsToday = agg?._count?._all ?? 0;
    const tokensToday = (agg?._sum.promptTokens ?? 0) + (agg?._sum.completionTokens ?? 0);
    if (!isSpendOverLimit({ callsToday, tokensToday, callsLimit, tokensLimit })) return;
    // Быстрый претест без записи: уже алертили сегодня (клейм ниже — для гонки)
    if (user.aiAlertedAt && user.aiAlertedAt >= midnight) return;

    const claimed = await db.user.updateMany({
      where: { id: userId, OR: [{ aiAlertedAt: null }, { aiAlertedAt: { lt: midnight } }] },
      data: { aiAlertedAt: new Date() },
    });
    if (claimed.count === 0) return; // другой параллельный вызов уже алертнул

    const parts = [
      callsLimit > 0 ? `${callsToday} вызовов при пороге ${callsLimit}` : `${callsToday} вызовов`,
      tokensLimit > 0 ? `${tokensToday} токенов при пороге ${tokensLimit}` : null,
    ].filter(Boolean);
    const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true } });
    await Promise.allSettled(
      admins.map((a) =>
        notifyUser(a.id, {
          type: "ai_spend_alert",
          title: `ИИ: предел трат у ${user.name}`,
          body: `За сегодня: ${parts.join(" · ")}. Раздел «ИИ» в штабе — детали и блокировка.`,
          url: "/admin/ai",
        })
      )
    );
  } catch (e) {
    console.error("[ai] spend alert failed:", e);
  }
}
