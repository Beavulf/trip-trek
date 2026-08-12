import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

// GET /api/nearby?lat=..&lng=..&radius=1500&category=cafe (requires auth)
// P0 #2: нет default Guangzhou coords — bad/empty coords → 400.
//         User-Agent — "TripTrek/1.0" (без China).
//         Session уже проверяется requireUser (раньше тоже было).
//         Rate-limit — in-memory bucket per userId (60 req/час).
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 час
const RATE_LIMIT_MAX = 60; // 60 запросов в час на пользователя
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): { ok: boolean; resetIn?: number } {
  const now = Date.now();
  const entry = rateLimit.get(userId);
  if (!entry || entry.resetAt < now) {
    rateLimit.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { ok: false, resetIn: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  // P0 #2: rate-limit per user
  const rl = checkRateLimit(user!.id);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Слишком много запросов к «Рядом». Попробуйте через ${Math.ceil((rl.resetIn ?? 0) / 60)} мин.`, places: [] },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get("lat");
  const lngStr = searchParams.get("lng");

  // P0 #2: нет China-default — без coords → 400 (а не fallback Гуанчжоу)
  if (!latStr || !lngStr) {
    return NextResponse.json(
      { places: [], error: "lat, lng required — включите геолокацию" },
      { status: 400 }
    );
  }
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { places: [], error: "Некорректные координаты" },
      { status: 400 }
    );
  }

  const radius = Math.min(Math.max(parseInt(searchParams.get("radius") || "1500") || 1500, 100), 5000); // 100m..5km
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
          headers: { "Accept": "application/json", "User-Agent": "TripTrek/1.0 (travel app)" },
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

    return NextResponse.json({ places, source: "OpenStreetMap (Overpass)" });
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
