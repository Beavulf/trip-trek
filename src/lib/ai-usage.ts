// Чистая математика ИИ-подсистемы: реестр фич, парсинг usage, пороги алертов.
// Без db и без Next — только тестируемые чистые функции (vitest, node-env).
// Оркестратор (вызов провайдера, учёт, алерты) — в lib/ai.ts.

export type AiFeature =
  | "ai-summary"
  | "foods-suggest"
  | "phrases-ai"
  | "planner"
  | "restaurants"
  | "walk";

export interface AiFeatureConfig {
  /** Лимит вызовов на юзера на поездку. */
  limit: { max: number; windowMs: number };
  temperature: number;
  /**
   * Таймаут вызова провайдера. GLM-«размышляющие» модели на свободном
   * творческом тексте (рассказ) легко сидят 70–90 с — общий дефолт 60 с их
   * рвёт (кейс 2026-09-16: ai-summary стабильно падал в empty на 60-й секунде).
   */
  timeoutMs: number;
  /**
   * Шов под премиум-гейт (см. runAi в lib/ai.ts): "all" — всем;
   * "premium-or-byok" — премиум или свой ключ. Пока у всех "all" —
   * включение гейта для новой фичи не потребует правок оркестратора.
   */
  access: "all" | "premium-or-byok";
}

/** Лимит обычных генераций — как исторически в docs/api.md (10/ч на юзера+поездку). */
const HOURLY_10 = { max: 10, windowMs: 60 * 60_000 };
/** Планировщик самый дорогой по токенам (большой JSON на всю поездку) — 3/ч. */
const HOURLY_3 = { max: 3, windowMs: 60 * 60_000 };
/** Overpass-фичи: сам OSM-запрос тяжёлый для публичных зеркал — умеренный лимит. */
const HOURLY_6 = { max: 6, windowMs: 60 * 60_000 };

const TIMEOUT_60 = 60_000;
/** Прогулка жила на 44 с впритык к дефолту — запас на медльных ответах провайдера. */
const TIMEOUT_90 = 90_000;
/** Рассказ: замер на routerai/GLM — 71–84 с чистой генерации. */
const TIMEOUT_180 = 180_000;

export const AI_FEATURES: Record<AiFeature, AiFeatureConfig> = {
  "ai-summary": { limit: HOURLY_10, temperature: 0.9, timeoutMs: TIMEOUT_180, access: "all" },
  "foods-suggest": { limit: HOURLY_10, temperature: 0.8, timeoutMs: TIMEOUT_60, access: "all" },
  "phrases-ai": { limit: HOURLY_10, temperature: 0.7, timeoutMs: TIMEOUT_60, access: "all" },
  planner: { limit: HOURLY_3, temperature: 0.6, timeoutMs: TIMEOUT_60, access: "all" },
  restaurants: { limit: HOURLY_6, temperature: 0.7, timeoutMs: TIMEOUT_60, access: "all" },
  walk: { limit: HOURLY_6, temperature: 0.7, timeoutMs: TIMEOUT_90, access: "all" },
};

export interface AiUsageTokens {
  promptTokens: number;
  completionTokens: number;
}

/**
 * Достать usage из ответа провайдера. OpenAI-совместимые API отдают его не всегда
 * (часть ретраев/прокси режет поле) — недостающее честно считаем нулём: алерты
 * по вызовам продолжают работать, по токенам просто не набирают.
 */
export function parseAiUsage(data: unknown): AiUsageTokens {
  const usage = (data as { usage?: unknown } | null)?.usage;
  if (!usage || typeof usage !== "object") return { promptTokens: 0, completionTokens: 0 };
  const u = usage as Record<string, unknown>;
  return {
    promptTokens: typeof u.prompt_tokens === "number" && Number.isFinite(u.prompt_tokens) && u.prompt_tokens > 0 ? Math.floor(u.prompt_tokens) : 0,
    completionTokens:
      typeof u.completion_tokens === "number" && Number.isFinite(u.completion_tokens) && u.completion_tokens > 0 ? Math.floor(u.completion_tokens) : 0,
  };
}

/** Начало текущих UTC-суток: окно суточных агрегатов и дедупа алертов. */
export function utcMidnight(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Порог трат: превышен, если хоть одно АКТИВНОЕ (лимит > 0) измерение выше лимита.
 * 0 = измерение выключено. Сам дедуп «не чаще раза в сутки» — атомарный клейм в БД
 * (lib/ai.ts), здесь только чистое сравнение.
 */
export function isSpendOverLimit(input: {
  callsToday: number;
  tokensToday: number;
  callsLimit: number;
  tokensLimit: number;
}): boolean {
  if (input.callsLimit > 0 && input.callsToday > input.callsLimit) return true;
  if (input.tokensLimit > 0 && input.tokensToday > input.tokensLimit) return true;
  return false;
}
