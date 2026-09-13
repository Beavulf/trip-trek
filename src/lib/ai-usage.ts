// Чистая математика ИИ-подсистемы: реестр фич, парсинг usage, пороги алертов.
// Без db и без Next — только тестируемые чистые функции (vitest, node-env).
// Оркестратор (вызов провайдера, учёт, алерты) — в lib/ai.ts.

export type AiFeature = "ai-summary" | "foods-suggest" | "phrases-ai";

export interface AiFeatureConfig {
  /** Лимит вызовов на юзера на поездку: LLM стоит денег, у всех фич 10/час. */
  limit: { max: number; windowMs: number };
  temperature: number;
  /**
   * Шов под премиум-гейт (см. runAi в lib/ai.ts): "all" — всем;
   * "premium-or-byok" — премиум или свой ключ. Пока у всех "all" —
   * включение гейта для новой фичи не потребует правок оркестратора.
   */
  access: "all" | "premium-or-byok";
}

/** Лимит одинаковый у всех фич — как исторически в docs/api.md (10/ч на юзера+поездку). */
const HOURLY_10 = { max: 10, windowMs: 60 * 60_000 };

export const AI_FEATURES: Record<AiFeature, AiFeatureConfig> = {
  "ai-summary": { limit: HOURLY_10, temperature: 0.9, access: "all" },
  "foods-suggest": { limit: HOURLY_10, temperature: 0.8, access: "all" },
  "phrases-ai": { limit: HOURLY_10, temperature: 0.7, access: "all" },
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
