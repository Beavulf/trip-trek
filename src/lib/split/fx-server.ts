import { fetchJson } from "@/lib/outbound";
import type { Rates } from "./fx";

// Курсы на сервере — для автоматического создания повторяющихся трат в иностранной валюте (аренда в долларах).
// Только живые курсы: статичный запасной список из /api/currency здесь не годится — молча создать долг по
// устаревшему курсу хуже, чем подождать (трата создастся при следующем чтении, когда курсы вернутся).
// Кэш на час держит outbound.ts.

export async function fetchRates(): Promise<Rates | null> {
  const data = await fetchJson<{ rates?: Rates }>("https://open.er-api.com/v6/latest/USD", {
    cacheSec: 3600,
    timeoutMs: 8000,
  });
  const rates = data?.rates;
  return rates && typeof rates === "object" ? rates : null;
}
