import { describe, expect, it } from "vitest";
import {
  addDaysKey,
  currentLodging,
  daysBetween,
  findLodgingGaps,
  findOverlaps,
  formatStayRange,
  keyToStoredDate,
  localTodayKey,
  lodgingPhase,
  lodgingTouchesDay,
  MAX_LODGING_PRICE,
  nextLodging,
  nightNumber,
  nightsOf,
  phoneHref,
  pickLodgingInput,
  sortLodgings,
  toDateKey,
} from "./lodging";

const L = (id: string, checkIn: string, checkOut: string) => ({
  id,
  checkIn: `${checkIn}T12:00:00.000Z`,
  checkOut: `${checkOut}T12:00:00.000Z`,
});

describe("календарные даты", () => {
  it("ключ → полдень UTC → тот же ключ; невалидные и «31 февраля» отвергаются", () => {
    const d = keyToStoredDate("2026-10-07");
    expect(d?.toISOString()).toBe("2026-10-07T12:00:00.000Z");
    expect(toDateKey(d!)).toBe("2026-10-07");
    expect(keyToStoredDate("2026-02-31")).toBeNull();
    expect(keyToStoredDate("07.10.2026")).toBeNull();
    expect(keyToStoredDate("")).toBeNull();
  });

  it("локальный «сегодня» берётся по часам устройства, а не по UTC", () => {
    // 23:30 локально 7 октября — для UTC это уже может быть 8-е, а «сегодня» — 7-е
    expect(localTodayKey(new Date(2026, 9, 7, 23, 30))).toBe("2026-10-07");
    expect(localTodayKey(new Date(2026, 0, 2, 0, 5))).toBe("2026-01-02");
  });

  it("сутки между днями и сдвиг через границу месяца", () => {
    expect(daysBetween("2026-10-01", "2026-10-05")).toBe(4);
    expect(daysBetween("2026-10-05", "2026-10-01")).toBe(-4);
    expect(addDaysKey("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("ночи проживания", () => {
    expect(nightsOf(L("a", "2026-10-01", "2026-10-05"))).toBe(4);
    expect(nightsOf(L("a", "2026-10-01", "2026-10-01"))).toBe(0);
  });
});

describe("фазы и текущее проживание", () => {
  const stay = L("a", "2026-10-01", "2026-10-05");

  it("до заезда / внутри / в день выезда уже «был»", () => {
    expect(lodgingPhase(stay, "2026-09-30")).toBe("upcoming");
    expect(lodgingPhase(stay, "2026-10-01")).toBe("current");
    expect(lodgingPhase(stay, "2026-10-04")).toBe("current");
    expect(lodgingPhase(stay, "2026-10-05")).toBe("past");
  });

  it("0 ночей: current только в день заезда", () => {
    const day = L("d", "2026-10-03", "2026-10-03");
    expect(lodgingPhase(day, "2026-10-03")).toBe("current");
    expect(lodgingPhase(day, "2026-10-04")).toBe("past");
  });

  it("встык: в день выезда ночуем уже в следующем жилье", () => {
    const list = [L("b", "2026-10-05", "2026-10-08"), L("a", "2026-10-01", "2026-10-05")];
    expect(currentLodging(list, "2026-10-05")?.id).toBe("b");
    expect(currentLodging(list, "2026-10-04")?.id).toBe("a");
    expect(currentLodging(list, "2026-10-09")).toBeUndefined();
    expect(nextLodging(list, "2026-09-01")?.id).toBe("a");
    expect(nextLodging(list, "2026-10-02")?.id).toBe("b");
  });

  it("lodgingTouchesDay: заезд, ночи и день выезда включены, соседние дни — нет", () => {
    const s = L("a", "2026-10-01", "2026-10-05");
    expect(lodgingTouchesDay(s, "2026-09-30")).toBe(false);
    expect(lodgingTouchesDay(s, "2026-10-01")).toBe(true);
    expect(lodgingTouchesDay(s, "2026-10-05")).toBe(true);
    expect(lodgingTouchesDay(s, "2026-10-06")).toBe(false);
  });

  it("номер ночи и сортировка", () => {
    expect(nightNumber(stay, "2026-10-01")).toBe(1);
    expect(nightNumber(stay, "2026-10-03")).toBe(3);
    const sorted = sortLodgings([L("b", "2026-10-05", "2026-10-08"), L("a", "2026-10-01", "2026-10-05")]);
    expect(sorted.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("findLodgingGaps / findOverlaps", () => {
  it("ночи без жилья между проживаниями и в начале поездки", () => {
    const gaps = findLodgingGaps(
      [L("a", "2026-10-02", "2026-10-04"), L("b", "2026-10-06", "2026-10-08")],
      "2026-10-01",
      "2026-10-08"
    );
    expect(gaps).toEqual([
      { fromKey: "2026-10-01", toKey: "2026-10-02", nights: 1 },
      { fromKey: "2026-10-04", toKey: "2026-10-06", nights: 2 },
    ]);
  });

  it("жильё встык без дыр; ночь последнего дня поездки дырой не считается", () => {
    const gaps = findLodgingGaps(
      [L("a", "2026-10-01", "2026-10-05"), L("b", "2026-10-05", "2026-10-08")],
      "2026-10-01",
      "2026-10-08"
    );
    expect(gaps).toEqual([]);
  });

  it("хвост без жилья и защита от кривых дат", () => {
    expect(findLodgingGaps([L("a", "2026-10-01", "2026-10-03")], "2026-10-01", "2026-10-06")).toEqual([
      { fromKey: "2026-10-03", toKey: "2026-10-06", nights: 3 },
    ]);
    expect(findLodgingGaps([], "2026-10-06", "2026-10-01")).toEqual([]);
    expect(findLodgingGaps([], "1999-01-01", "2026-10-01")).toEqual([]);
  });

  it("пересечения: встык — не пересечение, наложение — да", () => {
    expect(findOverlaps([L("a", "2026-10-01", "2026-10-05"), L("b", "2026-10-05", "2026-10-08")]).size).toBe(0);
    const over = findOverlaps([
      L("a", "2026-10-01", "2026-10-05"),
      L("b", "2026-10-04", "2026-10-08"),
      L("c", "2026-10-10", "2026-10-12"),
    ]);
    expect([...over].sort()).toEqual(["a", "b"]);
  });
});

describe("форматирование", () => {
  it("диапазон дат стабилен независимо от пояса сервера/клиента", () => {
    expect(formatStayRange(L("a", "2026-10-07", "2026-10-11"))).toBe("7 окт. – 11 окт.");
    expect(formatStayRange(L("a", "2026-10-07", "2026-10-07"))).toBe("7 окт.");
  });

  it("tel: из свободного ввода; мусор и короткое — null", () => {
    expect(phoneHref("+86 (20) 8888-1234")).toBe("tel:+862088881234");
    expect(phoneHref("12")).toBeNull();
    expect(phoneHref(null)).toBeNull();
  });
});

describe("pickLodgingInput", () => {
  const base = { name: "  East Maple ", checkIn: "2026-10-01", checkOut: "2026-10-05" };

  it("create: обрезает и нормализует, пустые строки → null, даты → полдень UTC", () => {
    const r = pickLodgingInput({ ...base, city: " ", address: "东枫国际公寓", price: 120.5, checkInTime: "14:00" }, "create");
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      name: "East Maple",
      city: null,
      address: "东枫国际公寓",
      price: 120.5,
      checkInTime: "14:00",
    });
    expect(r.data.checkIn?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("create: имя и обе даты обязательны, выезд не раньше заезда", () => {
    expect(pickLodgingInput({ checkIn: "2026-10-01", checkOut: "2026-10-02" }, "create")).toMatchObject({ ok: false });
    expect(pickLodgingInput({ name: "A", checkIn: "2026-10-01" }, "create")).toMatchObject({ ok: false });
    expect(pickLodgingInput({ name: "A", checkIn: "2026-10-05", checkOut: "2026-10-01" }, "create")).toMatchObject({
      ok: false,
      error: expect.stringContaining("раньше"),
    });
  });

  it("patch: только присланные поля; null очищает nullable", () => {
    expect(pickLodgingInput({ phone: null, notes: "заметка" }, "patch")).toEqual({
      ok: true,
      data: { phone: null, notes: "заметка" },
    });
    expect(pickLodgingInput({}, "patch")).toEqual({ ok: true, data: {} });
    expect(pickLodgingInput({ name: "  " }, "patch")).toMatchObject({ ok: false });
  });

  it("отвергает: javascript:-ссылку, мусор в телефоне и времени, цену вне лимита, кривые координаты", () => {
    expect(pickLodgingInput({ ...base, bookingUrl: "javascript:alert(1)" }, "create")).toMatchObject({ ok: false });
    expect(pickLodgingInput({ ...base, bookingUrl: "https://booking.com/x" }, "create")).toMatchObject({ ok: true });
    expect(pickLodgingInput({ ...base, phone: "<script>" }, "create")).toMatchObject({ ok: false });
    expect(pickLodgingInput({ ...base, checkInTime: "25:00" }, "create")).toMatchObject({ ok: false });
    expect(pickLodgingInput({ ...base, price: -1 }, "create")).toMatchObject({ ok: false });
    expect(pickLodgingInput({ ...base, price: MAX_LODGING_PRICE + 1 }, "create")).toMatchObject({ ok: false });
    expect(pickLodgingInput({ ...base, lat: 91 }, "create")).toMatchObject({ ok: false });
    expect(pickLodgingInput({ ...base, name: 5 }, "create")).toMatchObject({ ok: false });
    expect(pickLodgingInput("x", "create")).toMatchObject({ ok: false });
  });
});
