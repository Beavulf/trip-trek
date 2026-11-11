import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
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

  // 45 дней + встроенные шрифты — тяжелее дефолтного 5000 ms лимита под параллельными воркерами
  it("длинный маршрут даёт больше одной страницы", { timeout: 60_000 }, async () => {
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

  it("ночёвка в дне: кириллица, латиница и адрес с иероглифами не ломают сборку", async () => {
    const days = [
      { dayNumber: 1, date: "2026-10-10", city: "Гуанчжоу", title: "Прибытие", summary: null, accentColor: null, places: [], night: { name: "River Hotel", address: "广州市天河区" } },
      { dayNumber: 2, date: "2026-10-11", city: "Гуанчжоу", title: "Город", summary: null, accentColor: null, places: [], night: { name: "Отель у реки", address: "ул. Речная, 5" } },
      { dayNumber: 3, date: "2026-10-12", city: "Гуанчжоу", title: "Дорога", summary: null, accentColor: null, places: [], night: null },
    ];
    const bytes = await buildRoutePdf({ title: "Поездка", destination: "Китай", currency: "USD", startDate: "2026-10-10", endDate: null, generatedAt: new Date(), days });
    expect(new TextDecoder("latin1").decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("письменности страны: иероглифы, хангыль, тайский, хинди, арабский дают рабочий PDF и запасные шрифты", async () => {
    const countries = [
      ["湾畔百货", "深南大道9968号这是一个很长很长的地址用来检查自动换行是否正常工作而不是跑到页面右边之外"],
      ["東京タワー", "東京都港区芝公園4丁目2-8"],
      ["경복궁", "서울특별시 종로구 사직로 161"],
      ["วัดพระแก้ว", "ถนนเจริญกรุง"],
      ["ताज महल", "नमस्ते"],
      ["برج خليفة", "شارع الشيخ زايد 12, دبي"],
      ["מלון הים", "רחוב דיזנגוף 50"],
      ["អង្គរវត្ត", "សួស្តី"],
      ["ရွှေတိဂုံဘုရား", "မင်္ဂလာပါ"],
    ];
    const days: RoutePdfDay[] = countries.map(([name, address], i) => ({
      dayNumber: i + 1,
      date: `2026-10-${10 + i}`,
      city: name,
      title: name,
      summary: null,
      accentColor: null,
      night: { name, address },
      places: [place({ name, address })],
    }));
    const bytes = await buildRoutePdf({ ...input(days), title: "Кругосветка 世界一周" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    const baseFonts = doc.context
      .enumerateIndirectObjects()
      .map(([, obj]) => (obj instanceof PDFDict ? obj.get(PDFName.of("BaseFont"))?.toString() : undefined))
      .filter(Boolean)
      .join(" ");
    for (const font of ["NotoSansCJK", "NotoSansThai", "NotoSansDevanagari", "NotoSansKhmer", "NotoSansMyanmar"]) {
      expect(baseFonts).toContain(font);
    }
  });

  it("запасные шрифты не подключаются к поездке без таких письменностей", async () => {
    const doc = await PDFDocument.load(await buildRoutePdf(input([day()])));
    const fonts = doc.context
      .enumerateIndirectObjects()
      .map(([, obj]) => (obj instanceof PDFDict ? obj.get(PDFName.of("BaseFont"))?.toString() : undefined))
      .filter(Boolean)
      .join(" ");
    expect(fonts).not.toContain("Noto");
  });

  it("дата дня и поездки не зависит от пояса сервера", async () => {
    const bytes = await buildRoutePdf({ ...input([day()]), startDate: "2026-10-08T00:00:00.000Z", endDate: "2026-10-19T23:59:59.999Z" });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
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
