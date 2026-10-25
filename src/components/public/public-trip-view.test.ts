import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicTripView, type PublicPhoto, type PublicTrip } from "./public-trip-view";

// Стили YARL в node-env не нужны, а vite:css тянет postcss.config.mjs с Tailwind и падает
vi.mock("yet-another-react-lightbox/styles.css", () => ({}));
vi.mock("yet-another-react-lightbox/plugins/captions.css", () => ({}));
vi.mock("yet-another-react-lightbox/plugins/counter.css", () => ({}));

// Поездка без дней и мест: карта (dynamic ssr:false) не рисуется, остаётся секция «Все фото»
const photo = (i: number, over: Partial<PublicPhoto> = {}): PublicPhoto => ({
  id: `p${i}`,
  url: `/uploads/${i}.jpg`,
  thumbUrl: `/uploads/${i}-thumb.jpg`,
  caption: null,
  isFavorite: false,
  lat: null,
  lng: null,
  takenAt: "2026-10-01T10:00:00.000Z",
  placeName: null,
  dayNumber: null,
  ...over,
});

const trip = (photos: PublicPhoto[], over: Partial<PublicTrip> = {}): PublicTrip => ({
  title: "Тест",
  destination: "Китай",
  emoji: "🌏",
  accent: "#f97316",
  startDate: "2026-10-01T00:00:00.000Z",
  endDate: null,
  totalDays: 0,
  allowDownload: false,
  hearts: 0,
  days: [],
  photos,
  // по умолчанию загружено всё (маленький альбом); догрузка — через over
  photosTotal: photos.length,
  ...over,
});

const render = (photos: PublicPhoto[], over?: Partial<PublicTrip>) =>
  renderToStaticMarkup(createElement(PublicTripView, { trip: trip(photos, over), token: "t" }));
const imgCount = (html: string) => (html.match(/<img /g) ?? []).length;

describe("PublicTripView: «Все фото» порциями", () => {
  it("150 фото → в DOM только первые 60 и кнопка «Показать ещё»", () => {
    const html = render(Array.from({ length: 150 }, (_, i) => photo(i)));
    expect(imgCount(html)).toBe(60);
    expect(html).toContain("Показать ещё · осталось 90");
    expect(html).toContain("/uploads/59-thumb.jpg");
    expect(html).not.toContain("/uploads/60-thumb.jpg");
  });

  it("60 фото и меньше — без кнопки", () => {
    const html = render(Array.from({ length: 60 }, (_, i) => photo(i)));
    expect(imgCount(html)).toBe(60);
    expect(html).not.toContain("Показать ещё");
  });

  it("пропорции из БД → aspect-ratio без заглушки 120px; без размеров — заглушка", () => {
    const html = render([photo(0, { width: 1200, height: 1600 }), photo(1)]);
    const imgs = html.match(/<img [^>]*>/g)!;
    expect(imgs[0]).toContain("aspect-ratio:1200 / 1600");
    expect(imgs[0]).not.toContain("min-h-[120px]");
    expect(imgs[1]).toContain("min-h-[120px]");
    expect(imgs[1]).not.toContain("aspect-ratio");
  });

  it("анимацию входа (Reveal) получают только первые 12 кадров", () => {
    // Reveal рисует opacity:0 в начальном состоянии; на странице есть и другие анимированные
    // блоки (обложка, панель), поэтому сравниваем число их вхождений относительно друг друга
    const hidden = (n: number) =>
      (render(Array.from({ length: n }, (_, i) => photo(i))).match(/opacity:0/g) ?? []).length;
    expect(hidden(12) - hidden(1)).toBe(11); // каждый кадр до 12-го добавляет свой Reveal
    expect(hidden(30)).toBe(hidden(12)); // кадры после 12-го — без framer-motion
  });

  it("счётчик галереи — от photosTotal из БД, а не от длины загруженного списка", () => {
    // первая SSR-партия (60) при 900 фото в поездке
    const html = render(Array.from({ length: 60 }, (_, i) => photo(i)), { photosTotal: 900 });
    expect(html).toContain("Все фото · 900");
  });

  it("загружена не вся галерея → кнопка ждёт догрузку порций с сервера", () => {
    const html = render(Array.from({ length: 60 }, (_, i) => photo(i)), { photosTotal: 900 });
    expect(html).toContain("Загружаем ещё");
  });
});

describe("PublicTripView: фото по ходу поездки", () => {
  const day = (dayNumber: number, city: string) => ({
    dayNumber,
    date: `2026-10-0${dayNumber}T00:00:00.000Z`,
    city,
    title: "",
    summary: null,
    places: [],
  });
  const days = [day(1, "Минск"), day(2, "Шанхай")];
  // порядок задаёт сервер: день ↑, время ↑ — страница его сохраняет
  const ordered = [
    photo(0, { dayNumber: 1 }),
    photo(1, { dayNumber: 1 }),
    photo(2, { dayNumber: 2 }),
  ];

  it("«Все фото» разбиты по дням: заголовок дня с городом и числом кадров", () => {
    const html = render(ordered, { days, totalDays: 2 });
    const all = html.slice(html.indexOf("Все фото"));
    expect(all).toContain("Шанхай");
    expect(all.indexOf("Минск")).toBeLessThan(all.indexOf("Шанхай"));
    expect(all).toContain("2 фото"); // день 1
    expect(all).toContain("1 фото"); // день 2
  });

  it("кадры идут в порядке, который пришёл с сервера (день 1 раньше дня 2)", () => {
    const html = render(ordered, { days, totalDays: 2 });
    const all = html.slice(html.indexOf("Все фото"));
    expect(all.indexOf("/uploads/0-thumb.jpg")).toBeLessThan(all.indexOf("/uploads/1-thumb.jpg"));
    expect(all.indexOf("/uploads/1-thumb.jpg")).toBeLessThan(all.indexOf("/uploads/2-thumb.jpg"));
  });

  it("в главе дня есть кнопка «Смотреть» с числом кадров дня", () => {
    const html = render(ordered, { days, totalDays: 2 });
    expect(html).toContain("Смотреть · 2");
    expect(html).toContain("Смотреть · 1");
  });

  it("плашка «Продолжить» не рисуется на сервере (место читается из localStorage после монтирования)", () => {
    expect(render(ordered, { days, totalDays: 2 })).not.toContain("Продолжить с того места");
  });
});

describe("PublicTripView: слайдшоу и карта по дням", () => {
  const place = (name: string, lat: number) => ({ name, category: "sight", lat, lng: 10, visited: false });
  const dayWith = (dayNumber: number, city: string, places: ReturnType<typeof place>[]) => ({
    dayNumber,
    date: `2026-10-0${dayNumber}T00:00:00.000Z`,
    city,
    title: "",
    summary: null,
    places,
  });
  const days = [dayWith(1, "Минск", [place("А", 1)]), dayWith(2, "Шанхай", [place("Б", 2)])];

  it("кнопка «Слайдшоу» есть при двух и более фото и нет при одном", () => {
    expect(render([photo(0), photo(1)])).toContain("Слайдшоу");
    expect(render([photo(0)])).not.toContain("Слайдшоу");
  });

  it("над картой — выбор дня: «Все дни» и чипы дней, у которых есть что показать", () => {
    const html = render([photo(0, { dayNumber: 1 })], { days, totalDays: 2 });
    const mapPart = html.slice(html.indexOf("Карта путешествия"));
    expect(mapPart).toContain("Все дни");
    expect(mapPart).toContain(">Д1<");
    expect(mapPart).toContain(">Д2<");
  });

  it("если на карте только один день — переключатель не нужен", () => {
    const html = render([photo(0)], { days: [days[0]], totalDays: 1 });
    expect(html).not.toContain("Все дни");
  });
});
