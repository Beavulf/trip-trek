/**
 * Исходящие HTTP-вызовы наружу (Nominatim, Open-Meteo, курсы, LLM):
 * таймаут + один ретрай + опциональный TTL-кэш. Без этого зависший
 * внешний сервис вешает запросы приложения.
 *
 * Возвращает null при неудаче — у всех вызовов есть свои fallback'и.
 * Для экзотических случаев (4xx у LLM) ретраев нет.
 */

interface CacheEntry {
  at: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();

// Верхняя планка размера кэша, чтобы Map не рос без конца
const CACHE_MAX = 500;

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  cacheSec?: number;
  headers?: Record<string, string>;
  /** POST (LLM-вызовы); по умолчанию GET */
  method?: "GET" | "POST";
  body?: string;
  /** ретраить и на 4xx (по умолчанию — только сеть/5xx) */
  retryOn4xx?: boolean;
}

export async function fetchJson<T>(
  url: string,
  opts: FetchJsonOptions = {}
): Promise<T | null> {
  const { timeoutMs = 8000, retries = 1, cacheSec, headers, method = "GET", body } = opts;

  if (method === "GET" && cacheSec && cacheSec > 0) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < cacheSec * 1000) {
      return hit.value as T;
    }
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          // Nominatim требует идентифицирующий UA (политика использования)
          "User-Agent": "TripTrek/1.0 (travel planner app)",
          ...headers,
        },
      });

      if (res.ok) {
        const value = (await res.json()) as T;
        if (method === "GET" && cacheSec && cacheSec > 0) {
          if (cache.size >= CACHE_MAX) {
            // простая ротация: выкидываем первую запись
            const firstKey = cache.keys().next().value;
            if (firstKey !== undefined) cache.delete(firstKey);
          }
          cache.set(url, { at: Date.now(), value });
        }
        return value;
      }

      // 4xx — ретраить бессмысленно (кроме явно запрошенного retryOn4xx)
      if (res.status < 500 && !opts.retryOn4xx) return null;
    } catch {
      // сеть/таймаут — на следующий круг
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  return null;
}
