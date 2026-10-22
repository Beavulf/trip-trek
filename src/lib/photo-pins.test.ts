import { describe, expect, it } from "vitest";
import { MAX_PIN_CLUSTERS, clusterPins, projectMercator, splitsAtZoom, type PinPoint } from "./photo-pins";

const photo = (id: string, lat: number | null, lng: number | null): PinPoint => ({ id, lat, lng });

// Детерминированный «рандом», чтобы тест не мигал
function lcg(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

describe("projectMercator", () => {
  it("нулевая точка и границы мира на зуме 0", () => {
    expect(projectMercator(0, 0, 0)).toEqual({ x: 128, y: 128 });
    expect(projectMercator(0, -180, 0).x).toBe(0);
    expect(projectMercator(0, 180, 0).x).toBe(256);
    expect(projectMercator(85.0511287798, 0, 0).y).toBeCloseTo(0, 3);
  });

  it("каждый зум удваивает мировые пиксели", () => {
    const a = projectMercator(23.1, 113.3, 5);
    const b = projectMercator(23.1, 113.3, 6);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(b.y).toBeCloseTo(a.y * 2, 6);
  });
});

describe("clusterPins", () => {
  // Две точки в ~200 м друг от друга (Гуанчжоу)
  const a = photo("a", 23.1291, 113.2644);
  const b = photo("b", 23.1309, 113.2644);

  it("далёкий зум склеивает соседей, ближний — разводит", () => {
    const far = clusterPins([a, b], { zoom: 8 });
    expect(far).toHaveLength(1);
    expect(far[0].items.map((p) => p.id)).toEqual(["a", "b"]);
    expect(far[0].cover.id).toBe("a"); // первый по порядку входа = самый свежий
    expect(far[0].lat).toBeCloseTo((23.1291 + 23.1309) / 2, 6);

    const near = clusterPins([a, b], { zoom: 18 });
    expect(near).toHaveLength(2);
    expect(near.map((c) => c.key).sort()).toEqual(["p:a", "p:b"]);
  });

  it("пропускает фото без координат и вне кадра", () => {
    const out = clusterPins(
      [a, photo("nolat", null, 113.2), photo("nolng", 23.1, null), photo("nan", NaN, 1), photo("far", 48.85, 2.35)],
      { zoom: 12, bounds: { south: 22, west: 112, north: 24, east: 114 } }
    );
    expect(out.flatMap((c) => c.items.map((p) => p.id))).toEqual(["a"]);
  });

  it("окно через антимеридиан (west > east)", () => {
    const out = clusterPins([photo("fiji", -17.7, 178.1), photo("samoa", -13.8, -171.8), photo("paris", 48.8, 2.3)], {
      zoom: 3,
      bounds: { south: -30, west: 170, north: 0, east: -160 },
    });
    expect(out.flatMap((c) => c.items.map((p) => p.id)).sort()).toEqual(["fiji", "samoa"]);
  });

  it("потолок меток оставляет самые густые", () => {
    const pts: PinPoint[] = [];
    // 5 одиночек по разным ячейкам и один «густой» кластер из 3 фото
    for (let i = 0; i < 5; i++) pts.push(photo(`s${i}`, 10 + i * 2, 10 + i * 2));
    pts.push(photo("x1", -30, 50), photo("x2", -30.0001, 50.0001), photo("x3", -30.0002, 50.0002));
    const out = clusterPins(pts, { zoom: 6, maxClusters: 3 });
    expect(out).toHaveLength(3);
    expect(out[0].items.map((p) => p.id)).toEqual(["x1", "x2", "x3"]);
  });

  it("ключ кластера не зависит от порядка и состава обложки (стабилен при панорамировании)", () => {
    const k1 = clusterPins([a, b], { zoom: 8 })[0].key;
    const k2 = clusterPins([b, a], { zoom: 8 })[0].key;
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^c:/);
  });

  it("реалистичная поездка: 277 фото в 12 местах → десятки меток вместо сотен", () => {
    const rnd = lcg(42);
    const places = Array.from({ length: 12 }, (_, i) => ({
      lat: 23 + (i % 4) * 0.9 + rnd() * 0.2,
      lng: 113 + Math.floor(i / 4) * 1.4 + rnd() * 0.2,
    }));
    const pts: PinPoint[] = Array.from({ length: 277 }, (_, i) => {
      const p = places[i % places.length];
      // разброс ~±60 м вокруг места: снято «у входа»
      return photo(`p${i}`, p.lat + (rnd() - 0.5) * 0.0012, p.lng + (rnd() - 0.5) * 0.0012);
    });

    const wholeTrip = clusterPins(pts, { zoom: 8 });
    const city = clusterPins(pts, { zoom: 13 });
    expect(wholeTrip.length).toBeLessThanOrEqual(12);
    expect(city.length).toBeLessThanOrEqual(MAX_PIN_CLUSTERS);
    expect(city.length).toBeLessThan(pts.length / 4);
    // ничего не потерялось: все 277 фото распределены по меткам
    expect(wholeTrip.reduce((n, c) => n + c.items.length, 0)).toBe(277);
  });
});

describe("splitsAtZoom", () => {
  const a = photo("a", 23.1291, 113.2644);
  const b = photo("b", 23.1309, 113.2644);

  it("разведёт на ближнем зуме, но не на дальнем", () => {
    expect(splitsAtZoom([a, b], 8)).toBe(false);
    expect(splitsAtZoom([a, b], 18)).toBe(true);
  });

  it("снято в одной точке — не разойдётся на любом зуме", () => {
    const same = [photo("1", 23.13, 113.26), photo("2", 23.13, 113.26), photo("3", 23.13, 113.26)];
    for (const z of [4, 10, 16, 18]) expect(splitsAtZoom(same, z)).toBe(false);
  });
});
