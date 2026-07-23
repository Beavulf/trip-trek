import { db } from "../src/lib/db";

// Reverse geocode все места без адреса через Nominatim (бесплатно, без ключа)
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ru&zoom=18`;
  const res = await fetch(url, {
    headers: { "User-Agent": "TripTrekChina/1.0 (travel app)" },
  });
  if (!res.ok) throw new Error(`geocode failed ${res.status}`);
  const data = await res.json();
  const a = data.address || {};
  const parts = [
    a.road || a.pedestrian || a.footway || a.neighbourhood,
    a.house_number,
    a.suburb || a.district,
    a.city || a.town || a.village || a.county,
  ].filter(Boolean);
  return parts.join(", ") || data.display_name || `${lat}, ${lng}`;
}

async function main() {
  const places = await db.place.findMany({ where: { OR: [{ address: null }, { address: "" }] } });
  console.log(`Found ${places.length} places without address`);

  let done = 0;
  for (const place of places) {
    try {
      const address = await reverseGeocode(place.lat, place.lng);
      await db.place.update({ where: { id: place.id }, data: { address } });
      console.log(`✓ [${++done}/${places.length}] ${place.name}: ${address}`);
      // Nominatim требует задержку между запросами (1 req/sec policy)
      await new Promise((r) => setTimeout(r, 1100));
    } catch (e) {
      console.log(`✗ [${++done}/${places.length}] ${place.name}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.log("Done!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });
