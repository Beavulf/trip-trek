import { NextRequest, NextResponse } from "next/server";
import { KNOWN_CITIES, decodeCustomKey } from "@/lib/city-coords";

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

// GET /api/weather?city=guangzhou&forecast=7
// GET /api/weather?lat=35.68&lng=139.69&name=Токио&timezone=Asia/Tokyo&forecast=7
// P1 #6: shared dictionary (KNOWN_CITIES) вместо LEGACY_CITIES — единый source of truth.
// P0 #3: decode custom key поддерживает отрицательные coords (новый формат custom:{lat},{lng}).
// P1 #5: при падении open-meteo → 502 error (не 200 + fake 28° fallback).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(7, Math.max(1, parseInt(searchParams.get("forecast") || "1")));

  // Определяем город: либо lat/lng напрямую, либо known/custom ключ
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
    // P0 #1: не Null Island — если coords невалидны, 400
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
      return NextResponse.json({ error: "Невалидные координаты" }, { status: 400 });
    }
    cityName = searchParams.get("name") || "Город";
    cityKey = searchParams.get("key") || `custom:${lat},${lng}`;
    timezone = searchParams.get("timezone") || undefined;
  } else {
    // Known или custom ключ
    cityKey = searchParams.get("city") || "";
    if (!cityKey || cityKey === "custom") {
      // P0 #2: cityKey "custom" без autocomplete → 400
      return NextResponse.json({ error: "City not found — выберите город в Маршруте" }, { status: 400 });
    }
    // P1 #6: shared dictionary
    const known = KNOWN_CITIES[cityKey];
    if (known) {
      lat = known.lat;
      lng = known.lng;
      cityName = known.name;
      timezone = known.timezone;
    } else {
      // P0 #3: decode custom key (поддерживает отрицательные coords)
      const decoded = decodeCustomKey(cityKey);
      if (!decoded) {
        // Unknown city → 400 (не fallback на GZ — уже было закрыто, подтверждаем)
        return NextResponse.json({ error: "City not found" }, { status: 400 });
      }
      lat = decoded.lat;
      lng = decoded.lng;
      cityName = searchParams.get("name") || "Город";
      timezone = searchParams.get("timezone") || undefined;
    }
  }

  try {
    const tzParam = timezone ? `&timezone=${encodeURIComponent(timezone)}` : "&timezone=auto";
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max${tzParam}&forecast_days=${days}`;
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`open-meteo returned ${res.status}`);
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
  } catch (e) {
    // P1 #5: при падении open-meteo → 502 error (не 200 + fake 28° fallback)
    const msg = e instanceof Error ? e.message : "weather fetch failed";
    console.error("[weather] open-meteo error:", msg);
    return NextResponse.json(
      { error: "Не удалось загрузить погоду. Попробуйте позже.", city: cityName, cityKey },
      { status: 502 }
    );
  }
}
