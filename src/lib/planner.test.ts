import { describe, it, expect } from "vitest";
import {
  validatePlannerResponse,
  sanitizeUserText,
  normalizeName,
  limitsFor,
  markFarDrafts,
  PLANNER_CATEGORIES,
  PLANNER_TIME_SLOTS,
  type PlannerDayDraft,
} from "./planner";

const ok = {
  days: [
    {
      dayNumber: 1,
      places: [
        { name: "Парк Гуэля", category: "park", timeOfDay: "morning", why: "Мозаики Гауди и вид на город с утра", budgetHint: "$", addressHint: "Gràcia" },
        { name: "Саграда Фамилия", category: "temple", timeOfDay: "afternoon", why: "Главный шедевр Гауди", budgetHint: "$$$" },
      ],
    },
  ],
};

describe("validatePlannerResponse", () => {
  it("пропускает валидный ответ", () => {
    const out = validatePlannerResponse(ok, { allowedDayNumbers: [1, 2], limits: limitsFor("trip"), exclude: [] });
    expect(out).toHaveLength(1);
    expect(out[0].places).toHaveLength(2);
    expect(out[0].places[0].geoConfidence).toBe("fail"); // гео ставит только геокодер
  });

  it("отбрасывает несуществующие дни, категории и слоты", () => {
    const raw = {
      days: [
        { dayNumber: 99, places: [{ name: "Чужой день", category: "sight", why: "x" }] },
        { dayNumber: 1, places: [{ name: "Странная категория", category: "рокет-порт", why: "x" }, { name: "Странный слот", category: "park", timeOfDay: "полдник", why: "x" }] },
      ],
    };
    const out = validatePlannerResponse(raw, { allowedDayNumbers: [1], limits: limitsFor("trip"), exclude: [] });
    expect(out).toHaveLength(1);
    expect(out[0].places[0].category).toBe("sight"); // фолбэк категории
    expect(out[0].places[0].timeOfDay).toBeNull(); // неизвестный слот отброшен
    expect(out[0].places).toHaveLength(2);
  });

  it("дедуп против исключений (существующие места и прошлый черновик)", () => {
    const raw = {
      days: [
        {
          dayNumber: 1,
          places: [
            { name: "саграда фамилия!", category: "temple", why: "дубль в другом регистре" },
            { name: "Новое место", category: "sight", why: "ок" },
          ],
        },
      ],
    };
    const out = validatePlannerResponse(raw, { allowedDayNumbers: [1], limits: limitsFor("trip"), exclude: ["Саграда Фамилия"] });
    expect(out[0].places.map((p) => p.name)).toEqual(["Новое место"]);
  });

  it("лимиты: не больше maxTotal и maxPerDay", () => {
    const places = Array.from({ length: 10 }, (_, i) => ({ name: `Место ${i}`, category: "sight", why: "x" }));
    const raw = { days: [{ dayNumber: 1, places }] };
    const out = validatePlannerResponse(raw, { allowedDayNumbers: [1], limits: limitsFor("day"), exclude: [] });
    expect(out[0].places).toHaveLength(6); // maxPerDay
  });

  it("мусор на входе — пусто, без исключений", () => {
    expect(validatePlannerResponse(null, { allowedDayNumbers: [1], limits: limitsFor("trip"), exclude: [] })).toEqual([]);
    expect(validatePlannerResponse("вот план!", { allowedDayNumbers: [1], limits: limitsFor("trip"), exclude: [] })).toEqual([]);
    expect(validatePlannerResponse({ days: "нет" }, { allowedDayNumbers: [1], limits: limitsFor("trip"), exclude: [] })).toEqual([]);
  });

  it("place без why отбрасывается — «почему» обязательная часть черновика", () => {
    const raw = { days: [{ dayNumber: 1, places: [{ name: "Без объяснения", category: "sight" }] }] };
    expect(validatePlannerResponse(raw, { allowedDayNumbers: [1], limits: limitsFor("trip"), exclude: [] })).toEqual([]);
  });
});

describe("sanitizeUserText", () => {
  it("нейтрализует markdown-ссылки (плантинг в промпт)", () => {
    expect(sanitizeUserText("Хочу в [крутое место](https://evil.example) пожалуйста")).toBe(
      "Хочу в крутое место (https://evil.example) пожалуйста"
    );
  });

  it("режет длину и управляющие символы", () => {
    expect(sanitizeUserText("a\u0000b\u0007c", 10)).toBe("a b c");
    expect(sanitizeUserText("x".repeat(500)).length).toBe(300);
  });
});

describe("normalizeName", () => {
  it("пунктуация и регистр не влияют", () => {
    expect(normalizeName("Саграда Фамилия!")).toBe(normalizeName("саграда фамилия"));
    expect(normalizeName("大雁塔?")).toBe(normalizeName("大雁塔"));
  });
});

describe("константы планера", () => {
  it("категории — подмножество CATEGORY_META, слоты — канонические", () => {
    expect(PLANNER_CATEGORIES).toContain("sight");
    expect(PLANNER_CATEGORIES).toContain("restaurant");
    expect(PLANNER_TIME_SLOTS).toEqual(["morning", "afternoon", "evening"]);
  });
});

describe("markFarDrafts — связность дня по координатам", () => {
  const draftPlace = (name: string, lat: number, lng: number) => ({
    name,
    nameEn: name,
    category: "sight",
    timeOfDay: null,
    why: "x",
    budgetHint: null,
    addressHint: null,
    geoConfidence: "exact" as const,
    lat,
    lng,
    address: null,
    farWarning: null,
  });

  // Гуанчжоу: соседние точки в паре километров и выброс в другом конце города
  const day: PlannerDayDraft = {
    dayNumber: 1,
    places: [
      draftPlace("Отель", 23.1291, 113.2644),
      draftPlace("Рядом с отелем", 23.1310, 113.2700),
      draftPlace("Далеко", 23.5500, 113.5900),
      draftPlace("Без гео", Number.NaN, Number.NaN),
    ],
  };
  // NaN-заглушка выше только для типа; на практике непрошедшие геокодинг — lat/lng null
  day.places[3] = { ...day.places[3], lat: null, lng: null };

  it("место дальше порога получает farWarning с километрами", () => {
    const drafts = [structuredClone(day)];
    markFarDrafts(drafts, new Map([[1, [{ lat: 23.1291, lng: 113.2644 }]]]));
    expect(drafts[0].places[0].farWarning).toBeNull(); // сам якорь — рядом с собой
    expect(drafts[0].places[1].farWarning).toBeNull(); // ~600 м от якоря
    expect(drafts[0].places[2].farWarning).toMatch(/км от остальных мест дня/);
    expect(drafts[0].places[3].farWarning).toBeNull(); // без координат — не судим
  });

  it("без якорей день судится по взаимной связности черновиков", () => {
    const drafts = [structuredClone(day)];
    markFarDrafts(drafts, new Map());
    expect(drafts[0].places[0].farWarning).toBeNull();
    expect(drafts[0].places[1].farWarning).toBeNull();
    expect(drafts[0].places[2].farWarning).toMatch(/км от остальных мест дня/); // выброс дня
  });

  it("плотный кластер далеко от якоря (отеля) всё равно предупреждается", () => {
    const solo: PlannerDayDraft[] = [
      {
        dayNumber: 2,
        places: [
          draftPlace("Кластер А", 39.9042, 116.4074), // Пекин
          draftPlace("Кластер Б", 39.9050, 116.4080), // в 100 м от А
        ],
      },
    ];
    markFarDrafts(solo, new Map([[2, [{ lat: 31.2304, lng: 121.4737 }]]])); // якорь — Шанхай
    expect(solo[0].places.every((p) => p.farWarning?.includes("км") ?? false)).toBe(true);
  });
});
