import { describe, expect, it } from "vitest";
import { directionsUrl, searchInChina, tripTouchesChina } from "./place-links";
import { inMainlandChina } from "./mainland-china";

const mainland: [string, number, number][] = [
  ["Пекин", 39.9, 116.4],
  ["Шанхай, Пудун", 31.14, 121.81],
  ["Гуанчжоу", 23.13, 113.26],
  ["Шэньчжэнь у границы с Гонконгом", 22.54, 114.06],
  ["Шэкоу", 22.48, 113.92],
  ["Чжухай у границы с Макао", 22.27, 113.57],
  ["Чэнду", 30.57, 104.07],
  ["Сиань", 34.34, 108.94],
  ["Ханчжоу", 30.27, 120.15],
  ["Харбин", 45.8, 126.53],
  ["Санья", 18.25, 109.51],
  ["Лхаса", 29.65, 91.11],
  ["Кашгар", 39.47, 75.99],
  ["Сямынь", 24.48, 118.09],
  ["Циндао", 36.07, 120.38],
  ["Даньдун", 40.13, 124.39],
];

const abroad: [string, number, number][] = [
  ["Гонконг", 22.32, 114.17],
  ["Лантау, Гонконг", 22.25, 113.95],
  ["Макао", 22.2, 113.54],
  ["Тайбэй", 25.03, 121.57],
  ["Цзиньмэнь", 24.45, 118.38],
  ["Ханой", 21.03, 105.85],
  ["Халонг", 20.95, 107.05],
  ["Катманду", 27.72, 85.32],
  ["Бишкек", 42.87, 74.59],
  ["Улан-Батор", 47.89, 106.91],
  ["Владивосток", 43.12, 131.89],
  ["Благовещенск", 50.27, 127.53],
  ["Пхеньян", 39.03, 125.75],
  ["Сеул", 37.57, 126.98],
  ["Токио", 35.68, 139.69],
  ["Москва", 55.75, 37.62],
  ["Сан-Франциско", 37.79, -122.41],
];

describe("inMainlandChina", () => {
  it.each(mainland)("%s — материковый Китай", (_, lat, lng) => {
    expect(inMainlandChina(lat, lng)).toBe(true);
  });
  it.each(abroad)("%s — не материковый Китай", (_, lat, lng) => {
    expect(inMainlandChina(lat, lng)).toBe(false);
  });
});

describe("directionsUrl", () => {
  it("в Китае ведёт в Amap, вне его — в Google", () => {
    expect(directionsUrl({ lat: 30.57, lng: 104.07, name: "Чэнду" })).toContain("uri.amap.com");
    expect(directionsUrl({ lat: 55.75, lng: 37.62, name: "Китай-город" })).toContain("google.com/maps");
    expect(directionsUrl({ lat: 22.32, lng: 114.17, name: "Гонконг" })).toContain("google.com/maps");
  });
});

const shanghai = { city: "Шанхай", places: [{ lat: 31.23, lng: 121.47 }] };
const tokyo = { city: "Токио", places: [{ lat: 35.68, lng: 139.69 }] };

describe("searchInChina — жильё без координат", () => {
  it("страну подсказывают места в том же городе", () => {
    expect(searchInChina("Шанхай", [tokyo, shanghai])).toBe(true);
    expect(searchInChina("Токио", [tokyo, shanghai])).toBe(false);
  });
  it("город неизвестен: Amap только если вся поездка в Китае", () => {
    expect(searchInChina(null, [shanghai])).toBe(true);
    expect(searchInChina("Сучжоу", [shanghai])).toBe(true);
    expect(searchInChina(null, [tokyo, shanghai])).toBe(false);
  });
  it("без точек ведём в Google", () => {
    expect(searchInChina("Шанхай", [])).toBe(false);
    expect(searchInChina("Шанхай", [{ city: "Шанхай", places: [] }])).toBe(false);
  });
  it("город дня из поиска годится вместо мест", () => {
    expect(searchInChina("Чэнду", [{ city: "Чэнду", cityKey: "custom:30.57,104.07", places: [] }])).toBe(true);
  });
});

describe("tripTouchesChina", () => {
  it("подсказка о картах нужна, если хоть одна точка в Китае", () => {
    expect(tripTouchesChina([tokyo, shanghai])).toBe(true);
    expect(tripTouchesChina([tokyo])).toBe(false);
    expect(tripTouchesChina([])).toBe(false);
  });
});
