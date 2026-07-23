import { NextResponse } from "next/server";

// GET /api/currency — курсы валют через open.er-api.com (бесплатно, без ключа)
// База: USD. Кэш 1 час.
export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error("currency fetch failed");
    const data = await res.json();

    // Нужные нам валюты
    const rates: Record<string, number> = {
      USD: 1,
      CNY: data.rates?.CNY ?? 7.2,
      HKD: data.rates?.HKD ?? 7.8,
      MOP: data.rates?.MOP ?? 8.0,
      RUB: data.rates?.RUB ?? 92,
    };

    return NextResponse.json({
      base: "USD",
      rates,
      updated: data.time_last_update_utc,
      fallback: false,
    });
  } catch {
    // Фолбэк статичные курсы
    return NextResponse.json({
      base: "USD",
      rates: {
        USD: 1,
        CNY: 7.2,
        HKD: 7.8,
        MOP: 8.0,
        RUB: 92,
      },
      updated: null,
      fallback: true,
    });
  }
}
