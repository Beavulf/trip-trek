import { describe, expect, it } from "vitest";
import { proposeStays, type HotelPlaceInput, type RouteDayInput } from "./lodging-import";

let seq = 0;
const hotel = (name: string, lat: number, lng: number, extra: Partial<HotelPlaceInput> = {}): HotelPlaceInput => ({
  id: `p${++seq}`,
  name,
  category: "hotel",
  lat,
  lng,
  address: null,
  budget: null,
  timeOfDay: null,
  ...extra,
});
const day = (n: number, city: string, places: HotelPlaceInput[]): RouteDayInput => ({
  dayNumber: n,
  date: `2026-10-${String(7 + n).padStart(2, "0")}T00:00:00.000Z`,
  city,
  places,
});

// Шаблон настоящей поездки: 8 записей, из них 5 проживаний
const realTrip = (): RouteDayInput[] => [
  day(1, "Гуанчжоу", [hotel("Отель East Maple International Apartment", 23.105, 113.408, { budget: 177, timeOfDay: "morning", address: "东枫国际公寓, 临江大道, Тяньхэ" })]),
  day(5, "Шэньчжэнь", [
    hotel("ВЫСЕЛЕНИЕ", 23.105, 113.408, { timeOfDay: "morning", address: "东枫国际公寓, 临江大道, Тяньхэ" }),
    hotel("ЗАСЕЛЕНИЕ", 22.543, 113.963, { timeOfDay: "afternoon", address: "湾畔百货, 深南大道, Наньшань" }),
  ]),
  // У выселения другой адрес, но та же точка
  day(8, "Гонконг", [
    hotel("ВЫСЕЛЕНИЕ", 22.543, 113.963, { timeOfDay: "morning", address: "肯德基, 沙祥街, Наньшань" }),
    hotel("ЗАСЕЛЕНИЕ", 22.342, 114.11, { budget: 15, timeOfDay: "afternoon", address: "青逸酒店 Rambler Oasis Hotel, 1, 青衣路 Tsing Yi Road" }),
  ]),
  // А здесь наоборот: тот же адрес при другой точке
  day(11, "Макао", [
    hotel("ВЫСЕЛЕНИЕ", 22.201, 113.546, { timeOfDay: "morning", address: "青逸酒店 Rambler Oasis Hotel, 1, 青衣路 Tsing Yi Road" }),
    hotel("ЗАСЕЛЕНИЕ", 22.195, 113.537, { budget: 15, timeOfDay: "afternoon", address: "文華酒店 Hotel Man Va, 30-34" }),
  ]),
  day(12, "Гуанчжоу", [hotel("Хотел", 23.117, 113.25, { budget: 15, timeOfDay: "evening", address: "East maple apartment" })]),
];

describe("proposeStays", () => {
  it("настоящая поездка: 8 записей превращаются в 5 проживаний встык", () => {
    const stays = proposeStays(realTrip(), [], "2026-10-20");
    expect(stays.map((s) => [s.checkIn, s.checkOut])).toEqual([
      ["2026-10-08", "2026-10-12"],
      ["2026-10-12", "2026-10-15"],
      ["2026-10-15", "2026-10-18"],
      ["2026-10-18", "2026-10-19"],
      ["2026-10-19", "2026-10-20"],
    ]);
    expect(stays.flatMap((s) => s.placeIds)).toHaveLength(8);
  });

  it("название берёт настоящее, а для «ЗАСЕЛЕНИЕ» — из адреса", () => {
    const stays = proposeStays(realTrip(), [], "2026-10-20");
    expect(stays.map((s) => s.name)).toEqual([
      "Отель East Maple International Apartment",
      "湾畔百货",
      "青逸酒店 Rambler Oasis Hotel",
      "文華酒店 Hotel Man Va",
      "East maple apartment",
    ]);
  });

  it("местное название нужно водителю и не дублирует основное", () => {
    const [first, second] = proposeStays(realTrip(), [], "2026-10-20");
    expect(first.nameLocal).toBe("东枫国际公寓");
    expect(second.nameLocal).toBeNull();
  });

  it("город — у дня заезда, цена — сумма бюджетов записей", () => {
    const stays = proposeStays(realTrip(), [], "2026-10-20");
    expect(stays.map((s) => s.city)).toEqual(["Гуанчжоу", "Шэньчжэнь", "Гонконг", "Макао", "Гуанчжоу"]);
    expect(stays.map((s) => s.price)).toEqual([177, null, 15, 15, 15]);
  });

  it("один отель на каждый день маршрута — одно проживание", () => {
    const days = [1, 2, 3].map((n) => day(n, "Токио", [hotel("Sakura Inn", 35.6 + n / 100, 139.7)]));
    const stays = proposeStays(days, [], "2026-10-12");
    expect(stays).toHaveLength(1);
    expect(stays[0]).toMatchObject({ checkIn: "2026-10-08", checkOut: "2026-10-10" });
  });

  it("возврат в тот же отель через другой — отдельное проживание", () => {
    const days = [
      day(1, "Токио", [hotel("Sakura Inn", 35.6, 139.7), hotel("Sakura Inn", 35.6, 139.7)]),
      day(3, "Киото", [hotel("Kyoto Stay", 35.0, 135.7)]),
      day(5, "Токио", [hotel("Sakura Inn", 35.6, 139.7)]),
    ];
    expect(proposeStays(days, [], "2026-10-14").map((s) => s.name)).toEqual(["Sakura Inn", "Kyoto Stay", "Sakura Inn"]);
  });

  it("одна запись в конце маршрута живёт до конца поездки, а в последний день — сутки", () => {
    expect(proposeStays([day(2, "Рим", [hotel("Roma", 41.9, 12.5)])], [], "2026-10-13")[0].checkOut).toBe("2026-10-13");
    expect(proposeStays([day(6, "Рим", [hotel("Roma", 41.9, 12.5)])], [], "2026-10-13")[0].checkOut).toBe("2026-10-14");
  });

  it("выселение без открытого проживания не ломает разбор", () => {
    const stays = proposeStays([day(2, "Рим", [hotel("ВЫСЕЛЕНИЕ", 41.9, 12.5, { address: "Via Roma 1, Рим" })])], [], "2026-10-13");
    expect(stays).toHaveLength(1);
    expect(stays[0].name).toBe("Via Roma 1");
  });

  it("уже привязанные и не отели в предложение не идут", () => {
    const days = [day(1, "Рим", [hotel("Roma", 41.9, 12.5, { lodgingId: "l1" }), hotel("Колизей", 41.9, 12.49, { category: "sight" })])];
    expect(proposeStays(days, [], "2026-10-13")).toEqual([]);
  });

  it("жильё с таким названием уже есть: привязка вместо дубля", () => {
    const [stay] = proposeStays([day(1, "Рим", [hotel(" roma  HOTEL ", 41.9, 12.5)])], [{ id: "l7", name: "Roma Hotel" }], "2026-10-13");
    expect(stay.lodgingId).toBe("l7");
  });

  it("порядок внутри дня: утро раньше вечера независимо от порядка в списке", () => {
    const days = [day(1, "Рим", [hotel("Вечерний", 41.9, 12.5, { timeOfDay: "evening" }), hotel("Утренний", 45, 9, { timeOfDay: "morning" })])];
    expect(proposeStays(days, [], "2026-10-13").map((s) => s.name)).toEqual(["Утренний", "Вечерний"]);
  });
});
