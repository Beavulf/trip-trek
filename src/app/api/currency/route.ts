import { NextRequest, NextResponse } from "next/server";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { fetchJson } from "@/lib/outbound";
import { FALLBACK_RATES } from "@/lib/currencies";

// GET /api/currency — курсы валют через open.er-api.com (бесплатно, без ключа)
// База: USD. Кэш 1 час.

export async function GET(req: NextRequest) {
  // Публичный эндпоинт с внешним вызовом — лимит по IP
  const limited = rateLimitMiddleware(req, "fx", 60, 60_000);
  if (limited) return limited;

  try {
    // Кэш 1ч + таймаут 8с: зависший курсовой API не вешает приложение
    const data = await fetchJson<{ rates?: Record<string, number>; time_last_update_utc?: string }>(
      "https://open.er-api.com/v6/latest/USD",
      { cacheSec: 3600, timeoutMs: 8000 }
    );
    if (!data?.rates) throw new Error("currency fetch failed");

    // Пропускаем ВСЕ живые курсы (API отдаёт ~160 валют): трата может быть
    // в валюте вне списка UI (EGP, BRL, ISK…). Для валют UI без живого курса — статичный fallback.
    const apiRates = data.rates;
    const rates: Record<string, number> = { ...apiRates };
    // Коды, для которых живого курса не было и подставлен статичный: клиент предупреждает «курс приблизительный»
    const approxCodes: string[] = [];
    for (const [code, fbRate] of Object.entries(FALLBACK_RATES)) {
      if (!(typeof rates[code] === "number" && rates[code] > 0)) {
        rates[code] = fbRate;
        approxCodes.push(code);
      }
    }

    return NextResponse.json({
      base: "USD",
      rates,
      updated: data.time_last_update_utc ?? null,
      fallback: false,
      approxCodes,
    });
  } catch {
    // Фолбэк статичные курсы (полный набор — все валюты из lib/currencies)
    return NextResponse.json({
      base: "USD",
      rates: FALLBACK_RATES,
      updated: null,
      fallback: true,
      approxCodes: Object.keys(FALLBACK_RATES),
    });
  }
}
