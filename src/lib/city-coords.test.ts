import { describe, it, expect } from "vitest";
import {
  KNOWN_CITIES,
  encodeCustomKey,
  decodeCustomKey,
  resolveCityCoords,
  hasCityCoords,
} from "./city-coords";

describe("encodeCustomKey / decodeCustomKey", () => {
  it("encode даёт формат custom:{lat},{lng}", () => {
    expect(encodeCustomKey(23.1291, 113.2644)).toBe("custom:23.1291,113.2644");
  });

  // P0 #3: старый "custom-{lat}-{lng}" ломался на отрицательных координатах.
  it("roundtrip на отрицательных координатах", () => {
    const key = encodeCustomKey(-33.86, -151.2);
    expect(decodeCustomKey(key)).toEqual({ lat: -33.86, lng: -151.2, isCustom: true });
  });

  it("roundtrip на нуле и целых", () => {
    expect(decodeCustomKey(encodeCustomKey(0, 0))).toEqual({ lat: 0, lng: 0, isCustom: true });
  });

  it("понимает legacy-ключ с отрицательными координатами", () => {
    expect(decodeCustomKey("custom--33.86-151.2")).toEqual({ lat: -33.86, lng: 151.2, isCustom: true });
  });

  it("понимает legacy-ключ с положительными координатами", () => {
    expect(decodeCustomKey("custom-23.1-113.2")).toEqual({ lat: 23.1, lng: 113.2, isCustom: true });
  });

  it("мусор возвращает null, а не NaN", () => {
    expect(decodeCustomKey("")).toBeNull();
    expect(decodeCustomKey("custom")).toBeNull();
    expect(decodeCustomKey("custom:abc,def")).toBeNull();
    expect(decodeCustomKey("custom-x-y")).toBeNull();
  });
});

describe("resolveCityCoords", () => {
  it("известный город отдаёт запись словаря", () => {
    expect(resolveCityCoords("guangzhou")).toBe(KNOWN_CITIES.guangzhou);
  });

  it("custom-ключ резолвится в координаты (name пустой — берётся из day.city)", () => {
    const r = resolveCityCoords(encodeCustomKey(-33.86, 151.2));
    expect(r).toMatchObject({ lat: -33.86, lng: 151.2, isCustom: true });
    expect(r?.name).toBe("");
  });

  it("голый 'custom' и неизвестный ключ — null", () => {
    expect(resolveCityCoords("custom")).toBeNull();
    expect(resolveCityCoords("atlantis")).toBeNull();
    expect(resolveCityCoords("")).toBeNull();
  });
});

describe("hasCityCoords", () => {
  it("known и custom — true, null/голый custom — false", () => {
    expect(hasCityCoords("guangzhou")).toBe(true);
    expect(hasCityCoords(encodeCustomKey(1.5, 2.5))).toBe(true);
    expect(hasCityCoords(null)).toBe(false);
    expect(hasCityCoords(undefined)).toBe(false);
    expect(hasCityCoords("custom")).toBe(false);
    expect(hasCityCoords("atlantis")).toBe(false);
  });
});
