import { NextRequest, NextResponse } from "next/server";

/**
 * Simple in-memory rate limiter.
 * Keyed by `${prefix}:${ip}`. Entries auto-expire after the window.
 *
 * For single-instance deploys this is sufficient. For multi-instance,
 * replace with a shared store (Redis, etc.).
 *
 * Usage:
 *   const limited = rateLimitMiddleware(req, "login", 5, 15 * 60_000);
 *   if (limited) return limited;
 */
interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Periodic cleanup of expired entries to prevent memory growth
const CLEANUP_INTERVAL = 5 * 60_000; // 5 min
let lastCleanup = 0;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

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

/**
 * Returns a 429 NextResponse if rate-limited, or null if the request is allowed.
 */
export function rateLimitMiddleware(
  req: NextRequest,
  prefix: string,
  maxRequests: number,
  windowMs: number
): NextResponse | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const key = `${prefix}:${ip}`;
  if (!rateLimitCheck(key, maxRequests, windowMs)) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } }
    );
  }
  return null;
}
