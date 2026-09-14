// Реальные POI из OpenStreetMap (Overpass): парсинг чистый и тестируемый,
// фетч — с зеркалами и таймаутами (паттерн api/nearby).
// Потребители: api/ai/restaurants, api/ai/walk. Координаты настоящие —
// ИИ только отбирает и описывает, а не придумывает места.

export type PoiKind = "food" | "sight" | "park";

export interface OsmPoi {
  name: string;
  kind: PoiKind;
  /** OSM-тип (amenity/tourism/leisure) — маппится в категорию места поездки. */
  osmType: string;
  /** Маппинг в CATEGORY_META места; гарантированно из списка. */
  category: string;
  cuisine: string | null;
  address: string | null;
  lat: number;
  lng: number;
  distance: number; // метры от точки запроса (haversine)
}

/** OSM-теги по виду; pub в еде — бары-пабы в прогулках не хуже кафе. */
export const POI_TAG_FILTERS: Record<PoiKind, string[]> = {
  food: ['"amenity"="restaurant"', '"amenity"="cafe"', '"amenity"="fast_food"', '"amenity"="bar"', '"amenity"="pub"'],
  sight: ['"tourism"="attraction"', '"tourism"="museum"', '"tourism"="viewpoint"', '"historic"="memorial"', '"historic"="monument"'],
  park: ['"leisure"="park"', '"leisure"="garden"'],
};

/** Категория места поездки из OSM-тегов (все ключи есть в CATEGORY_META). */
export function poiCategory(tags: Record<string, string>): { osmType: string; category: string } {
  if (tags.amenity === "cafe") return { osmType: "cafe", category: "cafe" };
  if (tags.amenity === "bar" || tags.amenity === "pub") return { osmType: "bar", category: "bar" };
  if (tags.amenity === "restaurant" || tags.amenity === "fast_food") return { osmType: "restaurant", category: "restaurant" };
  if (tags.tourism === "museum") return { osmType: "museum", category: "sight" };
  if (tags.tourism === "viewpoint") return { osmType: "viewpoint", category: "viewpoint" };
  if (tags.tourism === "attraction") return { osmType: "sight", category: "sight" };
  if (tags.historic) return { osmType: "historic", category: "sight" };
  if (tags.leisure === "park" || tags.leisure === "garden") return { osmType: "park", category: "park" };
  return { osmType: "sight", category: "sight" };
}

/** Haversine-дистанция в метрах (та же формула, что в api/nearby). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Парсинг ответа Overpass: только именованные POI, дедуп по имени+координате. */
export function parseOverpassElements(
  data: unknown,
  center: { lat: number; lng: number },
  kinds: PoiKind[],
  cap = 40
): OsmPoi[] {
  const elements = (data as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) return [];

  const wanted = new Set(kinds);
  const candidates: OsmPoi[] = [];

  for (const el of elements) {
    if (!isElement(el)) continue;
    const tags = el.tags ?? {};
    const name = (tags["name:ru"] || tags.name || tags["name:en"] || "").trim();
    if (!name) continue; // безымянные POI в черновиках бесполезны

    const { osmType, category } = poiCategory(tags);
    const kind: PoiKind = osmType === "cafe" || osmType === "restaurant" || osmType === "bar" ? "food" : osmType === "park" ? "park" : "sight";
    if (!wanted.has(kind)) continue;

    const addrParts = [tags["addr:street"], tags["addr:housenumber"], tags["addr:city"]].filter(Boolean);
    candidates.push({
      name: name.slice(0, 200),
      kind,
      osmType,
      category,
      cuisine: tags.cuisine ? tags.cuisine.split(";")[0].slice(0, 60) : null,
      address: addrParts.join(", ") || null,
      lat: el.lat,
      lng: el.lon,
      distance: haversineMeters(center.lat, center.lng, el.lat, el.lon),
    });
  }

  // Ближайшие — первыми; дедуп «то же имя в 150 м» (одно заведение, продублированное
  // в OSM): сетевые точки с одинаковым именем дальше 150 м (цепочки) не трогаем.
  candidates.sort((a, b) => a.distance - b.distance);
  const out: OsmPoi[] = [];
  for (const p of candidates) {
    if (out.length >= cap) break;
    const norm = normalizePoiName(p.name);
    if (out.some((q) => normalizePoiName(q.name) === norm && haversineMeters(q.lat, q.lng, p.lat, p.lng) < 150)) continue;
    out.push(p);
  }
  return out;
}

function isElement(el: unknown): el is { tags?: Record<string, string>; lat: number; lon: number } {
  if (typeof el !== "object" || el === null) return false;
  const e = el as { lat?: unknown; lon?: unknown };
  return typeof e.lat === "number" && typeof e.lon === "number" && Number.isFinite(e.lat) && Number.isFinite(e.lon);
}

export function normalizePoiName(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/**
 * Сопоставление выбора ИИ с реальным списком POI. ИИ имеет право только
 * выбирать имена из списка — всё, что не сматчилось (придуманное, искажённое),
 * молча отбрасывается: в выдачу попадают только настоящие места с координатами.
 */
export function matchPicksToPois(picks: { name: string }[], pois: OsmPoi[]): OsmPoi[] {
  const byNorm = new Map<string, OsmPoi>();
  for (const p of pois) byNorm.set(normalizePoiName(p.name), p);
  const out: OsmPoi[] = [];
  const taken = new Set<string>();
  for (const pick of picks) {
    const norm = normalizePoiName(String(pick.name ?? "").slice(0, 200));
    if (!norm) continue;
    let poi = byNorm.get(norm);
    if (!poi) {
      // частичное совпадение: ИИ любит дописывать город/суффиксы
      for (const [key, p] of byNorm) {
        if ((key.includes(norm) || norm.includes(key)) && key.length > 2) {
          poi = p;
          break;
        }
      }
    }
    if (!poi || taken.has(normalizePoiName(poi.name))) continue;
    taken.add(normalizePoiName(poi.name));
    out.push(poi);
  }
  return out;
}

/** Overpass QL: union узлов по тегам вокруг точки. */
export function buildOverpassQuery(kinds: PoiKind[], lat: number, lng: number, radius: number, cap: number): string {
  const tags = kinds.flatMap((k) => POI_TAG_FILTERS[k]);
  const filters = tags.map((t) => `node[${t}](around:${radius},${lat},${lng});`).join("");
  return `[out:json][timeout:15];(${filters});out body ${cap};`;
}

const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

/** Фетч POI с зеркал Overpass; null при полном провале (у вызывающих свой fallback). */
export async function fetchOsmPois(args: {
  lat: number;
  lng: number;
  radius: number;
  kinds: PoiKind[];
  cap?: number;
}): Promise<OsmPoi[] | null> {
  const { lat, lng, radius, kinds, cap = 40 } = args;
  const query = buildOverpassQuery(kinds, lat, lng, radius, cap);
  for (const ep of OVERPASS_MIRRORS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      let res: Response;
      try {
        res = await fetch(`${ep}?data=${encodeURIComponent(query)}`, {
          headers: { Accept: "application/json", "User-Agent": "TripTrek/1.0 (travel app)" },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) continue;
      const data: unknown = await res.json();
      return parseOverpassElements(data, { lat, lng }, kinds, cap);
    } catch {
      // зеркало недоступно — пробуем следующее
    }
  }
  return null;
}
