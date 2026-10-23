import { localDateKey } from "@/lib/split/dates";

// Клиент API «Сочтёмся». Каждый запрос несёт `today` — локальную дату пользователя: «сегодня» и «вчера»
// считаются по его календарю, а не по серверному UTC.

export class SplitApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export async function splitApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const url = `/api/split${path}${path.includes("?") ? "&" : "?"}today=${localDateKey()}`;
  const hasBody = init.body !== undefined;
  const r = await fetch(url, {
    method: init.method ?? "GET",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new SplitApiError((data as { error?: string })?.error || `Ошибка ${r.status}`, r.status);
  return data as T;
}

export const splitKeys = {
  all: ["split"] as const,
  groups: ["split", "groups"] as const,
  group: (id: string) => ["split", "group", id] as const,
  ledger: (id: string) => ["split", "ledger", id] as const,
  activity: (id: string) => ["split", "activity", id] as const,
};
