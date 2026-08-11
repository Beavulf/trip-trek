import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

// GET /api/nearby?lat=..&lng=..&radius=1500&category=cafe (requires auth)
export async function GET(req: NextRequest) {
  const { response } = await requireUser(req);
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get("lat");
  const lngStr = searchParams.get("lng");
  if (!latStr || !lngStr) return NextResponse.json({ places: [], error: "lat, lng required" }, { status: 400 });
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  const radius = parseInt(searchParams.get("radius") || "1500");
  const category = searchParams.get("category") || "all";

  // Маппинг категорий на OSM теги
  const tagMap: Record<string, string[]> = {
    cafe: ['"amenity"="cafe"'],
    restaurant: ['"amenity"="restaurant"', '"amenity"="fast_food"'],
    bar: ['"amenity"="bar"', '"amenity"="pub"'],
    all: ['"amenity"="cafe"', '"amenity"="restaurant"', '"amenity"="fast_food"', '"amenity"="bar"', '"amenity"="pub"'],
  };
  const tags = tagMap[category] || tagMap.all;

  // Overpass QL запрос
  const filters = tags.map((t) => `node[${t}](around:${radius},${lat},${lng});`).join("");
  const query = `[out:json][timeout:15];(${filters});out body 40;`;

  try {
    // Несколько зеркал Overpass для надёжности, с таймаутом
    const endpoints = [
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass-api.de/api/interpreter",
      "https://overpass.openstreetmap.fr/api/interpreter",
    ];
    let data: { elements?: Array<{ tags?: Record<string, string>; lat: number; lon: number }> } | null = null;
    let lastErr = "";
    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(`${ep}?data=${encodeURIComponent(query)}`, {
          method: "GET",
          headers: { "Accept": "application/json", "User-Agent": "TripTrekChina/1.0" },
          signal: controller.signal,
          next: { revalidate: 300 },
        });
        clearTimeout(timeout);
        if (res.ok) {
          data = await res.json();
          break;
        }
        lastErr = `${ep}: ${res.status}`;
      } catch (e) {
        lastErr = `${ep}: ${(e as Error).message}`;
      }
    }
    if (!data) throw new Error(lastErr || "Серверы OpenStreetMap недоступны. Попробуйте позже.");

    const places = (data.elements || [])
      .map((el: { tags?: Record<string, string>; lat: number; lon: number }) => {
        const tags = el.tags || {};
        const name = tags.name || tags["name:ru"] || tags["name:en"] || "Без названия";
        const amenity = tags.amenity || "";
        const emoji = amenity === "cafe" ? "☕" : amenity === "bar" || amenity === "pub" ? "🍸" : amenity === "fast_food" ? "🍔" : "🍽️";
        // адрес
        const addrParts = [
          tags["addr:street"],
          tags["addr:housenumber"],
          tags["addr:suburb"],
          tags["addr:city"],
        ].filter(Boolean);
        return {
          name,
          category: amenity,
          emoji,
          cuisine: tags.cuisine || null,
          address: addrParts.join(", ") || null,
          lat: el.lat,
          lng: el.lon,
          // дистанция (haversine)
          distance: haversine(lat, lng, el.lat, el.lon),
        };
      })
      .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance)
      .slice(0, 30);

    return NextResponse.json({ places, source: "Overpass API (OpenStreetMap)" });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, places: [] },
      { status: 500 }
    );
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
