import { NextRequest, NextResponse } from "next/server";

/**
 * In-memory rate limiter (один инстанс — ADR-0005; шов под Redis позже).
 *
 * Ключ — `${prefix}:${userId|ip}`. Записи истекают по окну; фоновая чистка
 * раз в 5 минут не даёт Map расти бесконечно.
 *
 * Использование:
 *   const limited = userRateLimit(req, user.id, "photos", 20, 60*60_000);
 *   if (limited) return limited; // 429 + Retry-After
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

const CLEANUP_INTERVAL = 5 * 60_000; // 5 мин
let lastCleanup = 0;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/** true — запрос разрешён, false — лимит исчерпан. */
export function rateLimitCheck(key: string, maxRequests: number, windowMs: number): boolean {
  cleanup();
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count++;
  return true;
}

/** Результат с деталями для 429-ответа. */
export function limit(
  key: string,
  opts: { max: number; windowMs: number }
): { ok: boolean; retryAfterSec: number } {
  const ok = rateLimitCheck(key, opts.max, opts.windowMs);
  const retryAfterSec = ok ? 0 : Math.ceil((((store.get(key)?.resetAt ?? Date.now()) - Date.now())) / 1000);
  return { ok, retryAfterSec: Math.max(retryAfterSec, 1) };
}

/** IP из X-Forwarded-For (доверяем только за Caddy, он перезаписывает заголовок). */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function tooMany(retryAfterSec: number, windowMs: number): NextResponse {
  return NextResponse.json(
    { error: "Слишком много запросов. Попробуйте позже." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec || Math.ceil(windowMs / 1000)) } }
  );
}

/** Лимит по IP (анонимные/публичные эндпоинты: login, register, join GET, FX…). */
export function rateLimitMiddleware(
  req: NextRequest,
  prefix: string,
  maxRequests: number,
  windowMs: number
): NextResponse | null {
  const { ok, retryAfterSec } = limit(`${prefix}:${clientIp(req)}`, { max: maxRequests, windowMs });
  return ok ? null : tooMany(retryAfterSec, windowMs);
}

/** Лимит по пользователю (мутации: фото, аватары, импорт, LLM…). */
export function userRateLimit(
  req: NextRequest,
  userId: string | null | undefined,
  prefix: string,
  maxRequests: number,
  windowMs: number
): NextResponse | null {
  const key = userId ? `${prefix}:${userId}` : `${prefix}:${clientIp(req)}`;
  const { ok, retryAfterSec } = limit(key, { max: maxRequests, windowMs });
  return ok ? null : tooMany(retryAfterSec, windowMs);
}
