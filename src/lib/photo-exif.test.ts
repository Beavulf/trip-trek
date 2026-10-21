import { describe, expect, it } from "vitest";
import { normalizeExifGps, parseExifDate } from "./photo-exif";
import { dayIdForDate } from "./trip-days";

describe("parseExifDate", () => {
  it("парсит классический EXIF-формат YYYY:MM:DD HH:MM:SS", () => {
    const d = parseExifDate("2026:10:09 12:34:56");
    expect(d).toEqual(new Date(2026, 9, 9, 12, 34, 56));
  });

  it("принимает уже оживлённый Date от exifr (reviveValues)", () => {
    const src = new Date(2026, 9, 8, 7, 8, 9);
    expect(parseExifDate(src)).toEqual(src);
  });

  it("терпит мусор: null вместо падения", () => {
    expect(parseExifDate("не дата")).toBeNull();
    expect(parseExifDate(undefined)).toBeNull();
    expect(parseExifDate(new Date("nope"))).toBeNull();
  });
});

describe("normalizeExifGps", () => {
  it("север/восток остаются положительными", () => {
    expect(normalizeExifGps(23.129, "N", 113.264, "E")).toEqual({ lat: 23.129, lng: 113.264 });
  });

  it("юг/запад дают минус", () => {
    expect(normalizeExifGps(33.87, "S", 151.2, "W")).toEqual({ lat: -33.87, lng: -151.2 });
  });

  it("ref отсутствует — считаем N/E (реальные камеры пишут ref всегда)", () => {
    expect(normalizeExifGps(10, undefined, 20, undefined)).toEqual({ lat: 10, lng: 20 });
  });

  it("вне диапазона и мусор → null (в БД не попадает)", () => {
    expect(normalizeExifGps(120, "N", 10, "E")).toBeNull();
    expect(normalizeExifGps("abc", "N", 10, "E")).toBeNull();
    expect(normalizeExifGps(NaN, "N", 10, "E")).toBeNull();
  });
});

describe("dayIdForDate", () => {
  const days = [
    { id: "d1", date: new Date(2026, 9, 8).toISOString() },
    { id: "d2", date: new Date(2026, 9, 9).toISOString() },
    { id: "d3", date: new Date(2026, 9, 10).toISOString() },
  ];

  it("снимок днём 9-го числа ложится в день 2 (время игнорируется)", () => {
    expect(dayIdForDate(days, new Date(2026, 9, 9, 21, 30))).toBe("d2");
  });

  it("полночь на границе — тот же календарный день", () => {
    expect(dayIdForDate(days, new Date(2026, 9, 8, 0, 0))).toBe("d1");
  });

  it("снимок вне дат маршрута → null (фото уйдёт в день по умолчанию)", () => {
    expect(dayIdForDate(days, new Date(2026, 9, 1))).toBeNull();
  });
});
