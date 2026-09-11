import { db } from "@/lib/db";

export type AiKeySource = "user" | "admin" | "env" | "none";

export interface ResolvedAiKey {
  key: string | null;
  source: AiKeySource;
}

/**
 * Откуда брать ключ для OpenAI-совместимого API (BYOK).
 * Приоритет: свой ключ пользователя → общий ключ админа (AppSettings) → env.
 * Пользовательский ключ берём только по явному userId — в ответ API ключ
 * никогда не возвращается, наружу идёт лишь замаскированный хвост.
 */
export async function resolveAiKey(userId?: string | null): Promise<ResolvedAiKey> {
  if (userId) {
    const row = await db.user.findUnique({ where: { id: userId }, select: { aiApiKey: true } });
    if (row?.aiApiKey) return { key: row.aiApiKey, source: "user" };
  }

  const settings = await db.appSettings.findUnique({ where: { id: "app" }, select: { aiApiKey: true } });
  if (settings?.aiApiKey) return { key: settings.aiApiKey, source: "admin" };

  if (process.env.OPENAI_API_KEY) return { key: process.env.OPENAI_API_KEY, source: "env" };

  return { key: null, source: "none" };
}

/** Замаскированный хвост ключа для показа в UI: «…b7Fk» */
export function maskKey(key: string): string {
  const tail = key.slice(-4);
  return `••••${tail}`;
}
