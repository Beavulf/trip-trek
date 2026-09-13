import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fetchJson } from "@/lib/outbound";
import { userRateLimit } from "@/lib/rate-limit";

// GET /api/geocode?lat=..&lng=.. — reverse geocoding (requires auth)
export async function GET(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  // Лимит: запросы идут на nominatim с общего IP сервера (~1 req/s по их
  // политике) — один аккаунт без лимита выбивал геокодинг всем (аудит 2026-09-12)
  const limited = userRateLimit(req, user!.id, "geocode", 60, 3600_000);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  if (!lat || !lng) return NextResponse.json({ error: "lat, lng required" }, { status: 400 });

  // Числовая валидация до интерполяции в URL: сырые строки позволяли инъекцию
  // лишних параметров в запрос к Nominatim (аудит 2026-09-12)
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum) || Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
    return NextResponse.json({ error: "Невалидные координаты" }, { status: 400 });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ru&zoom=18`;
    // Точку по координатам спрашивают часто и повторно — кэш на сутки
    const data = await fetchJson<{
      display_name?: string;
      address?: Record<string, string>;
    }>(url, { cacheSec: 86400, timeoutMs: 8000 });
    if (!data) throw new Error("geocode failed");

    // Формируем читаемый адрес
    const a = data.address || {};
    const parts = [
      a.road || a.pedestrian || a.footway || a.neighbourhood,
      a.house_number,
      a.suburb || a.district,
      a.city || a.town || a.village || a.county,
      a.state,
      a.country,
    ].filter(Boolean);

    const displayName = data.display_name || parts.join(", ");

    return NextResponse.json({
      address: displayName,
      short: [a.road, a.house_number, a.city || a.town || a.village].filter(Boolean).join(", ") || displayName,
      raw: data.address,
    });
  } catch {
    return NextResponse.json({
      address: `${lat}, ${lng}`,
      short: `${lat}, ${lng}`,
      fallback: true,
    });
  }
}
