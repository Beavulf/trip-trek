import { NextRequest, NextResponse } from "next/server";

// GET /api/city-search?q=Tokyo — поиск городов через Open-Meteo Geocoding API
// Бесплатный API без ключа, возвращает города с координатами и страной
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Open-Meteo Geocoding API: https://open-meteo.com/en/docs/geocoding-api
    // Параметры: name (запрос), count (лимит), language, format
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=ru&format=json`;
    const r = await fetch(url, { cache: "no-store" });

    if (!r.ok) {
      return NextResponse.json({ results: [], error: "geocoding failed" }, { status: 502 });
    }

    const data = await r.json();

    if (!data.results || data.results.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // Мапим в удобный формат
    const results = data.results.map((c: {
      id: number;
      name: string;
      latitude: number;
      longitude: number;
      country?: string;
      country_code?: string;
      admin1?: string; // регион/штат
      timezone?: string;
      population?: number;
    }) => ({
      id: c.id,
      name: c.name,
      country: c.country || "",
      countryCode: c.country_code || "",
      region: c.admin1 || "",
      lat: c.latitude,
      lng: c.longitude,
      timezone: c.timezone || "",
      // Определяем язык по коду страны
      language: getLanguageByCountryCode(c.country_code || ""),
      // Флаг страны (emoji)
      flag: countryCodeToFlag(c.country_code || ""),
      label: `${c.name}${c.admin1 ? ", " + c.admin1 : ""}${c.country ? ", " + c.country : ""}`,
    }));

    return NextResponse.json({ results });
  } catch (e) {
    console.error("City search error:", e);
    return NextResponse.json({ results: [], error: "fetch failed" }, { status: 500 });
  }
}

// Определение языка по коду страны (ISO 3166-1 alpha-2)
function getLanguageByCountryCode(code: string): string {
  const map: Record<string, string> = {
    CN: "zh",      // Китай — китайский
    TW: "zh",      // Тайвань — китайский
    HK: "zh",      // Гонконг — китайский
    MO: "zh",      // Макао — китайский
    JP: "ja",      // Япония — японский
    KR: "ko",      // Корея — корейский
    TH: "th",      // Таиланд — тайский
    VN: "vi",      // Вьетнам — вьетнамский
    FR: "fr",      // Франция — французский
    DE: "de",      // Германия — немецкий
    ES: "es",      // Испания — испанский
    IT: "it",      // Италия — итальянский
    PT: "pt",      // Португалия — португальский
    BR: "pt",      // Бразилия — португальский
    RU: "ru",      // Россия — русский
    US: "en",      // США — английский
    GB: "en",      // Великобритания — английский
    AU: "en",      // Австралия — английский
    CA: "en",      // Канада — английский
    IN: "hi",      // Индия — хинди
    TR: "tr",      // Турция — турецкий
    AE: "ar",      // ОАЭ — арабский
    EG: "ar",      // Египет — арабский
    MA: "ar",      // Марокко — арабский
    GR: "el",      // Греция — греческий
    NL: "nl",      // Нидерланды — нидерландский
    SE: "sv",      // Швеция — шведский
    PL: "pl",      // Польша — польский
    CZ: "cs",      // Чехия — чешский
    HU: "hu",      // Венгрия — венгерский
    ID: "id",      // Индонезия — индонезийский
    MY: "ms",      // Малайзия — малайский
    PH: "fil",     // Филиппины — филиппинский
    SG: "en",      // Сингапур — английский
    MX: "es",      // Мексика — испанский
    AR: "es",      // Аргентина — испанский
  };
  return map[code.toUpperCase()] || "en"; // по умолчанию английский
}

// Конвертация кода страны в emoji-флаг
function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return "🌍";
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}
