import { NextResponse } from "next/server";

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

export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error("currency fetch failed");
    const data = await res.json();

    // Берём курс из API, если нет — fallback. Если и fallback нет — 0 (не должно случаться).
    const rates: Record<string, number> = {};
    for (const [code, fbRate] of Object.entries(FALLBACK_RATES)) {
      const apiRate = (data.rates as Record<string, number> | undefined)?.[code];
      rates[code] = typeof apiRate === "number" && apiRate > 0 ? apiRate : fbRate;
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
