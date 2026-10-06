import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildRoutePdf,
  type RoutePdfDay,
  type RoutePdfInput,
  type RoutePdfPlace,
} from "./route-pdf";

function place(p: Partial<RoutePdfPlace> = {}): RoutePdfPlace {
  return {
    name: "Запретный город",
    category: "sight",
    timeOfDay: "morning",
    address: "4 Jingshan Front St",
    budget: 60,
    description: "Резиденция императоров династий Мин и Цин",
    notes: "Билеты брать заранее, у входа очередь",
    ...p,
  };
}

function day(d: Partial<RoutePdfDay> = {}): RoutePdfDay {
  return {
    dayNumber: 1,
    date: "2026-10-10",
    city: "Пекин",
    title: "",
    summary: null,
    accentColor: "#f97316",
    places: [place()],
    ...d,
  };
}

function input(days: RoutePdfDay[]): RoutePdfInput {
  return {
    title: "Китай вдвоём",
    destination: "Китай",
    currency: "CNY",
    startDate: "2026-10-10",
    endDate: "2026-10-24",
    days,
    generatedAt: new Date("2026-10-06T12:00:00Z"),
  };
}

describe("buildRoutePdf", () => {
  it("выдаёт валидный PDF с кириллицей", async () => {
    const bytes = await buildRoutePdf(input([day()]));
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("%PDF");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("длинный маршрут даёт больше одной страницы", async () => {
    const days = Array.from({ length: 45 }, (_, i) =>
      day({
        dayNumber: i + 1,
        city: `Город ${i + 1}`,
        places: [
          place(),
          place({
            name: "Храм Ламы",
            category: "temple",
            timeOfDay: "afternoon",
            notes: "очень длинные заметки посетителя ".repeat(30),
          }),
        ],
      })
    );
    const doc = await PDFDocument.load(await buildRoutePdf(input(days)));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("день без мест и пустые опциональные поля не падают", async () => {
    const bytes = await buildRoutePdf(
      input([
        { ...day(), places: [] },
        day({
          dayNumber: 2,
          city: "Шанхай",
          summary: "саммари дня ".repeat(60),
          places: [place({ address: null, budget: null, description: null, notes: null })],
        }),
      ])
    );
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("%PDF");
  });
});
