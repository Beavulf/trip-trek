import type { UploadOutcome } from "./types";

// Разбор ответа POST /api/photos в решение для очереди. Вынесено из fetch-обёртки,
// чтобы правило «что повторять, а что нет» покрывалось тестом без сети.

const RATE_DEFAULT_MS = 60_000;
const RATE_MIN_MS = 5_000;
const RATE_MAX_MS = 10 * 60_000;

/** Retry-After бывает секундами или HTTP-датой; мусор → разумный дефолт, кап — чтобы очередь не засыпала на часы. */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number {
  if (!header) return RATE_DEFAULT_MS;
  const secs = Number(header);
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(header) - now;
  if (!Number.isFinite(ms)) return RATE_DEFAULT_MS;
  return Math.min(RATE_MAX_MS, Math.max(RATE_MIN_MS, ms));
}

function errorText(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return fallback;
}

export function classifyUploadResponse(
  status: number,
  body: unknown,
  retryAfter?: string | null,
  now = Date.now()
): UploadOutcome {
  if (status >= 200 && status < 300) return { kind: "ok", photo: body };

  // 409 = «этот кадр уже в поездке». Бывает и когда первая попытка дошла до сервера,
  // а ответ потерялся по дороге: для юзера это успех, а не ошибка
  if (status === 409) return { kind: "duplicate" };

  if (status === 401) return { kind: "auth", message: errorText(body, "Войдите снова") };

  if (status === 429) {
    return {
      kind: "rate",
      message: errorText(body, "Слишком много загрузок подряд"),
      retryAfterMs: parseRetryAfter(retryAfter, now),
    };
  }

  // 408/425 и любые 5xx — временные: прокси перегружен, контейнер рестартует,
  // sharp не успел. Повторяем с отступом
  if (status === 408 || status === 425 || status >= 500) {
    return { kind: "retry", message: errorText(body, `Сервер ответил ${status}`) };
  }

  // Остальные 4xx (формат, размер, права, чужой день) от повтора не изменятся
  return { kind: "permanent", message: errorText(body, `Ошибка ${status}`) };
}

/** Экспоненциальный отступ с джиттером: 2, 4, 8, 16, 32, 60 с — друзья на одной сети не бьют сервер синхронно. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.75 + random() * 0.5));
}
