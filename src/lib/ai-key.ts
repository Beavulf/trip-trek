import { db } from "@/lib/db";

export type AiKeySource = "user" | "admin" | "env" | "none";

export interface ResolvedAiConfig {
  key: string | null;
  baseUrl: string | null;
  model: string | null;
  source: AiKeySource;
}

/**
 * Откуда брать конфиг OpenAI-совместимого API (BYOK).
 *
 * Ключ: свой ключ пользователя → общий ключ админа (AppSettings) → env.
 * База и модель: админ (AppSettings) → env — это настройка сервера целиком,
 * общая для всех ключей (ключ и адрес провайдера должны совпадать, поэтому
 * админ задаёт их под того провайдера, чьи ключи используются).
 *
 * В ответ API конфиг никогда не возвращается целиком — ключ только маской.
 */
export async function resolveAiConfig(userId?: string | null): Promise<ResolvedAiConfig> {
  let key = process.env.OPENAI_API_KEY || null;
  let baseUrl = process.env.OPENAI_BASE_URL || null;
  let model = process.env.OPENAI_MODEL || null;
  let source: AiKeySource = key ? "env" : "none";

  const settings = await db.appSettings.findUnique({
    where: { id: "app" },
    select: { aiApiKey: true, aiBaseUrl: true, aiModel: true },
  });
  if (settings?.aiApiKey) {
    key = settings.aiApiKey;
    source = "admin";
  }
  if (settings?.aiBaseUrl) baseUrl = settings.aiBaseUrl;
  if (settings?.aiModel) model = settings.aiModel;

  if (userId) {
    const row = await db.user.findUnique({ where: { id: userId }, select: { aiApiKey: true } });
    if (row?.aiApiKey) {
      key = row.aiApiKey;
      source = "user";
    }
  }

  return { key, baseUrl, model, source };
}

/** Замаскированный хвост ключа для показа в UI: «…b7Fk» */
export function maskKey(key: string): string {
  return `••••${key.slice(-4)}`;
}

/**
 * База OpenAI-совместимого API без хвостового слэша. Если провайдер указан
 * голым хостом (https://api.deepseek.com) — добавляем /v1: почти все
 * OpenAI-совместимые API живут под /v1, а в пути с версией смысла нет.
 */
export function openaiChatUrl(baseUrl: string | null | undefined): string {
  const base = (baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").trim().replace(/\/+$/, "");
  try {
    const u = new URL(base);
    if (u.pathname === "" || u.pathname === "/") return `${base}/v1`;
  } catch {
    // не URL — отдаём как есть, провайдер вернёт понятную ошибку
  }
  return base;
}
