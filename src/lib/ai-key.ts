import { db } from "@/lib/db";

export type AiKeySource = "user" | "admin" | "env" | "none";

/** Дефолтная модель, когда не задана ни у юзера, ни админом, ни в env. */
export const DEFAULT_AI_MODEL = "gpt-4o-mini";

export interface ResolvedAiConfig {
  key: string | null;
  baseUrl: string | null;
  model: string | null;
  source: AiKeySource;
  /** Полный запрет ИИ для юзера (админ-блок). Проверяется в runAi — единой точке. */
  aiBlocked: boolean;
}

// ─── Чистое ядро резолва: env / AppSettings / User ──────────────────────────

export interface AiEnvConfig {
  key: string | null;
  baseUrl: string | null;
  model: string | null;
}
export interface AiSettingsConfig {
  aiApiKey: string | null;
  aiBaseUrl: string | null;
  aiModel: string | null;
}
export interface AiUserConfig {
  aiApiKey: string | null;
  aiBaseUrl: string | null;
  aiModel: string | null;
}

/**
 * Откуда брать конфиг OpenAI-совместимого API.
 *
 * Общий уровень: админ (AppSettings) → env. База и модель — настройка сервера
 * целиком, общая для всех ключей (ключ и адрес провайдера должны совпадать).
 *
 * Своё перекрывает общее. ИНВАРИАНТ БЕЗОПАСНОСТИ: юзерский адрес получает
 * ТОЛЬКО юзерский ключ — user.aiBaseUrl читается исключительно внутри ветки
 * user?.aiApiKey, поэтому админский/env ключ физически не может уйти на
 * управляемый юзером хост (иначе сервер превращается в прокси утечки ключа).
 *
 * В ответ API конфиг никогда не возвращается целиком — ключ только маской.
 */
export function pickAiConfig(
  env: AiEnvConfig,
  settings: AiSettingsConfig | null,
  user: AiUserConfig | null
): { key: string | null; baseUrl: string | null; model: string | null; source: AiKeySource } {
  let key = settings?.aiApiKey ?? env.key;
  let baseUrl = settings?.aiBaseUrl ?? env.baseUrl;
  let model = settings?.aiModel ?? env.model;
  let source: AiKeySource = settings?.aiApiKey ? "admin" : env.key ? "env" : "none";

  if (user?.aiApiKey) {
    key = user.aiApiKey;
    source = "user";
    if (user.aiBaseUrl) {
      // Полный BYOK: свой провайдер — модель своя или нейтральный дефолт
      // (админская модель от чужого провайдера не сработает).
      baseUrl = user.aiBaseUrl;
      model = user.aiModel ?? DEFAULT_AI_MODEL;
    } else {
      // Только ключ, адрес общий — прежнее поведение.
      model = user.aiModel ?? model;
    }
  }

  return { key, baseUrl, model, source };
}

/** Загрузить конфиг из БД и env и отдать полный резолв (с флагом блока). */
export async function resolveAiConfig(userId?: string | null): Promise<ResolvedAiConfig> {
  const env: AiEnvConfig = {
    key: process.env.OPENAI_API_KEY || null,
    baseUrl: process.env.OPENAI_BASE_URL || null,
    model: process.env.OPENAI_MODEL || null,
  };

  const [settings, user] = await Promise.all([
    db.appSettings.findUnique({
      where: { id: "app" },
      select: { aiApiKey: true, aiBaseUrl: true, aiModel: true },
    }),
    userId
      ? db.user.findUnique({
          where: { id: userId },
          select: { aiApiKey: true, aiBaseUrl: true, aiModel: true, aiBlocked: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    ...pickAiConfig(env, settings, user),
    aiBlocked: user?.aiBlocked ?? false,
  };
}

/** Замаскированный хвост ключа для показа в UI: «…b7Fk» */
export function maskKey(key: string): string {
  return `••••${key.slice(-4)}`;
}

/**
 * Валидация Base URL провайдера — единственная для админки и профиля юзера.
 * https-only (аудит 2026-09-12): на этот URL уходят Bearer-ключи, не-https
 * или не-URL значение отклоняется. http://localhost — только в dev (моки).
 */
export function validateAiBaseUrl(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  try {
    const u = new URL(raw);
    const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(isLocal && process.env.NODE_ENV !== "production")) {
      return { ok: false, error: "только https" };
    }
    return { ok: true, value: raw };
  } catch {
    return { ok: false, error: "некорректный URL" };
  }
}

/**
 * База OpenAI-совместимого API без хвостового слэша. Если провайдер указан
 * голым хостом (https://api.deepseek.com) — добавляем /v1: почти все
 * OpenAI-совместимые API живут под /v1, а в пути с версией смысла нет.
 */
export function openaiChatUrl(baseUrl: string | null | undefined): string {
  const fallback = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const base = (baseUrl ?? fallback).trim().replace(/\/+$/, "");
  try {
    const u = new URL(base);
    const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(isLocal && process.env.NODE_ENV !== "production")) {
      return fallback;
    }
    if (u.pathname === "" || u.pathname === "/") return `${base}/v1`;
  } catch {
    // не URL — дефолт вместо сырой строки (это мог быть инъекция пути)
    return fallback;
  }
  return base;
}
