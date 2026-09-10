import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { fetchJson } from "@/lib/outbound";

// GET /api/geocode?lat=..&lng=.. — reverse geocoding (requires auth)
export async function GET(req: NextRequest) {
  const { response } = await requireUser(req);
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  if (!lat || !lng) return NextResponse.json({ error: "lat, lng required" }, { status: 400 });

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
