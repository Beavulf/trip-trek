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

const CITIES = {
  guangzhou: { lat: 23.1291, lng: 113.2644, name: "Гуанчжоу" },
  shenzhen: { lat: 22.5431, lng: 114.0579, name: "Шэньчжэнь" },
  hongkong: { lat: 22.3193, lng: 114.1694, name: "Гонконг" },
  macau: { lat: 22.1987, lng: 113.5439, name: "Макао" },
};

// GET /api/weather?city=guangzhou
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cityKey = (searchParams.get("city") || "guangzhou") as keyof typeof CITIES;
  const city = CITIES[cityKey] || CITIES.guangzhou;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia%2FShanghai&forecast_days=1`;
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error("weather fetch failed");
    const data = await res.json();

    const code = data.current?.weather_code ?? 0;
    const wmo = WMO_CODES[code] || { label: "—", emoji: "🌡️" };

    return NextResponse.json({
      city: city.name,
      cityKey,
      temperature: Math.round(data.current?.temperature_2m ?? 0),
      apparent: Math.round(data.current?.apparent_temperature ?? 0),
      humidity: data.current?.relative_humidity_2m ?? 0,
      wind: Math.round(data.current?.wind_speed_10m ?? 0),
      code,
      label: wmo.label,
      emoji: wmo.emoji,
      max: Math.round(data.daily?.temperature_2m_max?.[0] ?? 0),
      min: Math.round(data.daily?.temperature_2m_min?.[0] ?? 0),
    });
  } catch {
    return NextResponse.json({
      city: city.name,
      cityKey,
      temperature: 28,
      apparent: 31,
      humidity: 70,
      wind: 8,
      code: 0,
      label: "Ясно",
      emoji: "☀️",
      max: 31,
      min: 25,
      fallback: true,
    });
  }
}
