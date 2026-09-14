import { describe, it, expect } from "vitest";
import {
  parseOverpassElements,
  matchPicksToPois,
  buildOverpassQuery,
  haversineMeters,
  poiCategory,
  type OsmPoi,
} from "./poi";

const center = { lat: 34.4199, lng: 132.4598 }; // Хиросима — нейтральный центр

const overpassSample = {
  elements: [
    { lat: 34.42, lon: 132.46, tags: { name: "Мироку", amenity: "restaurant", cuisine: "ramen", "addr:street": "Susanoo", "addr:housenumber": "5" } },
    // без имени — отбрасывается
    { lat: 34.421, lon: 132.461, tags: { amenity: "cafe" } },
    // дубль имени (другой регистр/пунктуация) рядом — дедуп
    { lat: 34.4201, lon: 132.4601, tags: { name: "МИРОКУ!", amenity: "restaurant" } },
    { lat: 34.422, lon: 132.462, tags: { name: "Парк мира", leisure: "park" } },
    { lat: 34.423, lon: 132.463, tags: { name: "Музей памяти", tourism: "museum" } },
    // не из запрошенных видов (еда не запрошена ниже)
    { lat: 34.424, lon: 132.464, tags: { name: "Какое-то кафе", amenity: "cafe" } },
  ],
};

describe("parseOverpassElements", () => {
  it("берёт только именованные POI нужных видов, мапит категории, считает дистанцию", () => {
    const pois = parseOverpassElements(overpassSample, center, ["sight", "park"], 10);
    const names = pois.map((p) => p.name);
    expect(names).toContain("Парк мира");
    expect(names).toContain("Музей памяти");
    expect(names).not.toContain("Какое-то кафе");
    expect(names).not.toContain("Мироку");
    expect(pois[0].distance).toBeGreaterThanOrEqual(0);
    const museum = pois.find((p) => p.name === "Музей памяти")!;
    expect(museum.category).toBe("sight");
  });

  it("еда мапится в категории ресторан/кафе с кухней", () => {
    const pois = parseOverpassElements(overpassSample, center, ["food"], 10);
    const ramen = pois.find((p) => p.name === "Мироку");
    expect(ramen?.category).toBe("restaurant");
    expect(ramen?.cuisine).toBe("ramen");
  });

  it("мусор на входе — пусто", () => {
    expect(parseOverpassElements(null, center, ["food"])).toEqual([]);
    expect(parseOverpassElements({ elements: "нет" }, center, ["food"])).toEqual([]);
  });
});

describe("matchPicksToPois — защита от галлюцинаций ИИ", () => {
  const pois = parseOverpassElements(overpassSample, center, ["food", "sight", "park"], 20);

  it("возвращает только настоящие POI в порядке пиков", () => {
    const out = matchPicksToPois([{ name: "Парк мира" }, { name: "Мироку" }], pois);
    expect(out.map((p) => p.name)).toEqual(["Парк мира", "Мироку"]);
  });

  it("придуманное ИИ место отбрасывается молча", () => {
    const out = matchPicksToPois([{ name: "Вымышленный дворец счастья" }, { name: "Мироку" }], pois);
    expect(out.map((p) => p.name)).toEqual(["Мироку"]);
  });

  it("дубли пиков не дают два раза одно место", () => {
    const out = matchPicksToPois([{ name: "Мироку" }, { name: "Мироку!" }], pois);
    expect(out).toHaveLength(1);
  });
});

describe("buildOverpassQuery", () => {
  it("union узлов по тегам вокруг точки с капом", () => {
    const q = buildOverpassQuery(["food"], 10, 20, 1500, 40);
    expect(q).toContain("[out:json][timeout:15]");
    expect(q).toContain('node["amenity"="restaurant"](around:1500,10,20)');
    expect(q).toContain("out body 40;");
  });
});

describe("haversineMeters / poiCategory", () => {
  it("дистанция в разумных пределах", () => {
    // Москва → Питер ≈ 630–710 км
    const d = haversineMeters(55.75, 37.61, 59.94, 30.31);
    expect(d).toBeGreaterThan(600_000);
    expect(d).toBeLessThan(720_000);
  });

  it("osm-теги мапятся в категории мест поездки", () => {
    expect(poiCategory({ amenity: "cafe" }).category).toBe("cafe");
    expect(poiCategory({ amenity: "bar" }).category).toBe("bar");
    expect(poiCategory({ tourism: "viewpoint" }).category).toBe("viewpoint");
    expect(poiCategory({ historic: "memorial" }).category).toBe("sight");
    expect(poiCategory({ leisure: "garden" }).category).toBe("park");
  });
});

describe("типы", () => {
  it("OsmPoi стабилен", () => {
    const p: OsmPoi = { name: "x", kind: "food", osmType: "cafe", category: "cafe", cuisine: null, address: null, lat: 0, lng: 0, distance: 0 };
    expect(p.kind).toBe("food");
  });
});
