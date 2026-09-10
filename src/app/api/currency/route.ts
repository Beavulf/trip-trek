import { NextRequest, NextResponse } from "next/server";
import { rateLimitMiddleware } from "@/lib/rate-limit";
import { fetchJson } from "@/lib/outbound";

// GET /api/currency — курсы валют через open.er-api.com (бесплатно, без ключа)
// База: USD. Кэш 1 час.
// P1 #9: полный набор fallback для всех 24 валют из UI currency-converter.tsx
const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CNY: 7.2,
  JPY: 150,
  KRW: 1350,
  HKD: 7.8,
  MOP: 8.0,
  THB: 36,
  VND: 25000,
  SGD: 1.35,
  RUB: 92,
  BYN: 3.2,
  UAH: 40,
  KZT: 450,
  TRY: 32,
  AED: 3.67,
  INR: 83,
  IDR: 15800,
  MYR: 4.7,
  PHP: 56,
  AUD: 1.52,
  CAD: 1.36,
  CHF: 0.88,
};

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

    // Пропускаем ВСЕ живые курсы (API отдаёт ~160 валют): поездка может быть
    // в валюте вне списка UI (EGP, BRL, ISK…). Для валют UI без живого курса — статичный fallback.
    const apiRates = data.rates;
    const rates: Record<string, number> = { ...apiRates };
    for (const [code, fbRate] of Object.entries(FALLBACK_RATES)) {
      if (!(typeof rates[code] === "number" && rates[code] > 0)) rates[code] = fbRate;
    }

    return NextResponse.json({
      base: "USD",
      rates,
      updated: data.time_last_update_utc ?? null,
      fallback: false,
    });
  } catch {
    // Фолбэк статичные курсы (полный набор — covers all 24 currencies UI shows)
    return NextResponse.json({
      base: "USD",
      rates: FALLBACK_RATES,
      updated: null,
      fallback: true,
    });
  }
}
