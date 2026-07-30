import { NextRequest, NextResponse } from "next/server";

// Коды погоды WMO → описание + эмодзи
const WMO_CODES: Record<number, { label: string; emoji: string }> = {
  0: { label: "Ясно", emoji: "☀️" },
  1: { label: "Преимущественно ясно", emoji: "🌤️" },
  2: { label: "Переменная облачность", emoji: "⛅" },
  3: { label: "Пасмурно", emoji: "☁️" },
  45: { label: "Туман", emoji: "🌫️" },
  48: { label: "Изморозь", emoji: "🌫️" },
  51: { label: "Морось", emoji: "🌦️" },
  53: { label: "Морось", emoji: "🌦️" },
  55: { label: "Сильная морось", emoji: "🌧️" },
  61: { label: "Небольшой дождь", emoji: "🌦️" },
  63: { label: "Дождь", emoji: "🌧️" },
  65: { label: "Сильный дождь", emoji: "🌧️" },
  71: { label: "Небольшой снег", emoji: "🌨️" },
  73: { label: "Снег", emoji: "❄️" },
  75: { label: "Сильный снег", emoji: "❄️" },
  80: { label: "Ливень", emoji: "🌧️" },
  81: { label: "Ливень", emoji: "🌧️" },
  82: { label: "Сильный ливень", emoji: "⛈️" },
  95: { label: "Гроза", emoji: "⛈️" },
  96: { label: "Гроза с градом", emoji: "⛈️" },
  99: { label: "Гроза с градом", emoji: "⛈️" },
};

// Совместимость: старые ключи городов → координаты
const LEGACY_CITIES: Record<string, { lat: number; lng: number; name: string; timezone?: string }> = {
  guangzhou: { lat: 23.1291, lng: 113.2644, name: "Гуанчжоу", timezone: "Asia/Shanghai" },
  shenzhen: { lat: 22.5431, lng: 114.0579, name: "Шэньчжэнь", timezone: "Asia/Shanghai" },
  hongkong: { lat: 22.3193, lng: 114.1694, name: "Гонконг", timezone: "Asia/Hong_Kong" },
  macau: { lat: 22.1987, lng: 113.5439, name: "Макао", timezone: "Asia/Macau" },
  tokyo: { lat: 35.6762, lng: 139.6503, name: "Токио", timezone: "Asia/Tokyo" },
  paris: { lat: 48.8566, lng: 2.3522, name: "Париж", timezone: "Europe/Paris" },
  bangkok: { lat: 13.7563, lng: 100.5018, name: "Бангкок", timezone: "Asia/Bangkok" },
  phuket: { lat: 7.8804, lng: 98.3923, name: "Пхукет", timezone: "Asia/Bangkok" },
};

// GET /api/weather?city=guangzhou&forecast=7
// GET /api/weather?lat=35.68&lng=139.69&name=Токио&timezone=Asia/Tokyo&forecast=7
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(7, Math.max(1, parseInt(searchParams.get("forecast") || "1")));

  // Определяем город: либо lat/lng напрямую, либо legacy ключ
  let lat: number;
  let lng: number;
  let cityName: string;
  let cityKey: string;
  let timezone: string | undefined;

  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  if (latParam && lngParam) {
    // Прямые координаты (новый способ)
    lat = parseFloat(latParam);
    lng = parseFloat(lngParam);
    cityName = searchParams.get("name") || "Город";
    cityKey = searchParams.get("key") || `custom-${lat}-${lng}`;
    timezone = searchParams.get("timezone") || undefined;
  } else {
    // Legacy: ключ города
    cityKey = searchParams.get("city") || "guangzhou";
    const city = LEGACY_CITIES[cityKey] || LEGACY_CITIES.guangzhou;
    lat = city.lat;
    lng = city.lng;
    cityName = city.name;
    timezone = city.timezone;
  }

  try {
    const tzParam = timezone ? `&timezone=${encodeURIComponent(timezone)}` : "&timezone=auto";
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max${tzParam}&forecast_days=${days}`;
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error("weather fetch failed");
    const data = await res.json();

    const code = data.current?.weather_code ?? 0;
    const wmo = WMO_CODES[code] || { label: "—", emoji: "🌡️" };

    // Недельный прогноз
    const forecast: { date: string; max: number; min: number; code: number; label: string; emoji: string; precip: number | null }[] = [];
    if (days > 1 && data.daily?.time) {
      for (let i = 0; i < data.daily.time.length; i++) {
        const dCode = data.daily.weather_code?.[i] ?? 0;
        const dWmo = WMO_CODES[dCode] || { label: "—", emoji: "🌡️" };
        forecast.push({
          date: data.daily.time[i],
          max: Math.round(data.daily.temperature_2m_max?.[i] ?? 0),
          min: Math.round(data.daily.temperature_2m_min?.[i] ?? 0),
          code: dCode,
          label: dWmo.label,
          emoji: dWmo.emoji,
          precip: data.daily.precipitation_probability_max?.[i] ?? 0,
        });
      }
    }

    return NextResponse.json({
      city: cityName,
      cityKey,
      lat,
      lng,
      temperature: Math.round(data.current?.temperature_2m ?? 0),
      apparent: Math.round(data.current?.apparent_temperature ?? 0),
      humidity: data.current?.relative_humidity_2m ?? 0,
      wind: Math.round(data.current?.wind_speed_10m ?? 0),
      code,
      label: wmo.label,
      emoji: wmo.emoji,
      max: Math.round(data.daily?.temperature_2m_max?.[0] ?? 0),
      min: Math.round(data.daily?.temperature_2m_min?.[0] ?? 0),
      forecast,
    });
  } catch {
    return NextResponse.json({
      city: cityName,
      cityKey,
      lat,
      lng,
      temperature: 28,
      apparent: 31,
      humidity: 70,
      wind: 8,
      code: 0,
      label: "Ясно",
      emoji: "☀️",
      max: 31,
      min: 25,
      forecast: [],
      fallback: true,
    });
  }
}
