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

    // Нужные нам валюты (расширенный список)
    const rates: Record<string, number> = {
      USD: 1,
      EUR: data.rates?.EUR ?? 0.92,
      GBP: data.rates?.GBP ?? 0.79,
      CNY: data.rates?.CNY ?? 7.2,
      JPY: data.rates?.JPY ?? 150,
      KRW: data.rates?.KRW ?? 1350,
      HKD: data.rates?.HKD ?? 7.8,
      MOP: data.rates?.MOP ?? 8.0,
      THB: data.rates?.THB ?? 36,
      VND: data.rates?.VND ?? 25000,
      SGD: data.rates?.SGD ?? 1.35,
      RUB: data.rates?.RUB ?? 92,
      BYN: data.rates?.BYN ?? 3.2,
      UAH: data.rates?.UAH ?? 40,
      KZT: data.rates?.KZT ?? 450,
      TRY: data.rates?.TRY ?? 32,
      AED: data.rates?.AED ?? 3.67,
      INR: data.rates?.INR ?? 83,
      IDR: data.rates?.IDR ?? 15800,
      MYR: data.rates?.MYR ?? 4.7,
      PHP: data.rates?.PHP ?? 56,
      AUD: data.rates?.AUD ?? 1.52,
      CAD: data.rates?.CAD ?? 1.36,
      CHF: data.rates?.CHF ?? 0.88,
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
        EUR: 0.92,
        GBP: 0.79,
        CNY: 7.2,
        JPY: 150,
        KRW: 1350,
        HKD: 7.8,
        MOP: 8.0,
        THB: 36,
        RUB: 92,
        BYN: 3.2,
        AED: 3.67,
      },
      updated: null,
      fallback: true,
    });
  }
}
