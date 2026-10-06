# PDF-экспорт маршрута — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** кнопка на вкладке «Маршрут» скачивает PDF-файл с маршрутом поездки для офлайн-просмотра.

**Architecture:** серверный роут `GET /api/export/pdf?tripId=…` (гард «участник», выборка зеркалит `GET /api/route`) → чистая функция `buildRoutePdf()` из `pdf-lib` со вшитыми DejaVu-шрифтами (кириллица) → blob-скачивание на клиенте. Спека: `docs/superpowers/specs/2026-10-06-route-pdf-export-design.md`.

**Tech Stack:** pdf-lib + @pdf-lib/fontkit (чистый JS, работает под Bun), vitest (node-env), date-fns.

## Global Constraints

- Комментарии в коде — по-русски, объясняют «почему», не «что»; стиль окружающего кода.
- Гард только через `requireTripMember` из `src/lib/api-auth.ts` (любая роль — решение владельца).
- Без rate-limit (генерация дешёвая; решение в спеке).
- Эмодзи в PDF не рендерим — только текстовые подписи (`CATEGORY_SHORT`, слоты словами).
- `bun run lint` и `bun run test` зелёные после каждой задачи.
- Документация (`docs/api.md`, `docs/glossary.md`, `AGENTS.md`, `worklog.md`) — тем же коммитом, что и код.
- Сущности БД через Prisma возвращают `Date` для дат — в контракте билдера все даты строками ISO.

---

### Task 1: Шрифты, зависимости и чистый билдер `buildRoutePdf`

**Files:**
- Modify: `package.json` (deps — через `bun add`)
- Create: `src/lib/pdf/fonts/DejaVuSans.ttf`, `src/lib/pdf/fonts/DejaVuSans-Bold.ttf`, `src/lib/pdf/fonts/LICENSE`
- Modify: `src/lib/time-of-day.ts:62-87` (обобщаем `DaySection`/`daySections`)
- Create: `src/lib/pdf/route-pdf.ts`
- Test: `src/lib/pdf/route-pdf.test.ts`
- Modify: `docs/superpowers/specs/2026-10-06-route-pdf-export-design.md` (уточнение контракта — узкий тип места)

**Interfaces:**
- Consumes: `daySections()` из `src/lib/time-of-day.ts` (после обобщения принимает `{ timeOfDay: string | null }[]`), `CATEGORY_SHORT` из `src/lib/types.ts`, `currencySymbol(code)` из `src/lib/currencies.ts`.
- Produces: `buildRoutePdf(input: RoutePdfInput): Promise<Uint8Array>` и типы `RoutePdfInput` / `RoutePdfDay` / `RoutePdfPlace` — их использует Task 2 (роут) и тесты.

- [ ] **Step 1: Установить зависимости**

```bash
bun add pdf-lib @pdf-lib/fontkit
```

- [ ] **Step 2: Скачать шрифты DejaVu (кириллица, пермиссивная лицензия)**

Прямые ссылки на TTF из npm-пакета `dejavu-fonts-ttf@2.37.3` (без unzip):

```bash
mkdir -p src/lib/pdf/fonts
curl -L -o src/lib/pdf/fonts/DejaVuSans.ttf "https://unpkg.com/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf"
curl -L -o src/lib/pdf/fonts/DejaVuSans-Bold.ttf "https://unpkg.com/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf"
curl -L -o src/lib/pdf/fonts/LICENSE "https://unpkg.com/dejavu-fonts-ttf@2.37.3/LICENSE"
```

Проверка: `ls -la src/lib/pdf/fonts` — DejaVuSans ≈ 750KB, Bold ≈ 700KB, LICENSE ~2KB.

- [ ] **Step 3: Обобщить `daySections` под узкий тип места**

PDF-билдер передаёт свой узкий `RoutePdfPlace` (празма-строки дают `Date`, не `string`, поэтому полный `Place` не подходит). Обобщаем сигнатуру; для существующих вызовов (DayCard и др.) поведение и типы не меняются — `T` выводится как `Place`.

В `src/lib/time-of-day.ts` заменить (тела функций не трогаем — только сигнатуры):

```ts
// Было:
export interface DaySection {
  key: string;
  label: string;
  places: Place[];
}
// …
export function daySections(places: Place[]): DaySection[] {

// Стало:
export interface DaySection<T extends { timeOfDay: string | null } = Place> {
  key: string;
  label: string;
  places: T[];
}
// …
export function daySections<T extends { timeOfDay: string | null }>(places: T[]): DaySection<T>[] {
```

- [ ] **Step 4: Прогнать существующие тесты (регресс по сигнатурам)**

Run: `bun run test`
Expected: все существующие тесты зелёные (обобщение обратно совместимо).

- [ ] **Step 5: Написать падающий тест билдера**

`src/lib/pdf/route-pdf.test.ts`:

```ts
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
```

- [ ] **Step 6: Убедиться, что тест падает**

Run: `bun run test src/lib/pdf/route-pdf.test.ts`
Expected: FAIL — модуль `./route-pdf` не найден.

- [ ] **Step 7: Реализовать `src/lib/pdf/route-pdf.ts`**

`CATEGORY_SHORT` — из `src/lib/types.ts`, `currencySymbol` — из `src/lib/currencies.ts` (оба модуля сервер-безопасны). Полный файл:

```ts
// Чистый билдер PDF маршрута: данные → байты, без БД и fetch (тестируется в vitest).
// Кириллицу стандартные шрифты PDF не поддерживают, поэтому вшиваем DejaVu subset'ом.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { format } from "date-fns";
import { daySections } from "@/lib/time-of-day";
import { CATEGORY_SHORT } from "@/lib/types";
import { currencySymbol } from "@/lib/currencies";

export interface RoutePdfPlace {
  name: string;
  category: string;
  timeOfDay: string | null;
  address: string | null;
  budget: number | null;
  description: string | null;
  notes: string | null;
}

export interface RoutePdfDay {
  dayNumber: number;
  /** ISO-дата дня «2026-10-10» */
  date: string;
  city: string;
  title: string;
  summary: string | null;
  accentColor: string | null;
  places: RoutePdfPlace[];
}

export interface RoutePdfInput {
  title: string;
  destination: string;
  currency: string;
  startDate: string;
  endDate: string | null;
  days: RoutePdfDay[];
  generatedAt: Date;
}

// A4 в пунктах
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
// запас внизу страницы под колонтитул «стр. N из M»
const FOOTER_H = 24;

const INK = rgb(0.15, 0.14, 0.13);
const MUTED = rgb(0.47, 0.45, 0.42);
const LINE_SOFT = rgb(0.85, 0.84, 0.82);
const ACCENT_FALLBACK = "f97316";

// Шрифты читаются с диска один раз и кэшируются (~700KB каждый, перечитывать
// на каждый запрос незачем). process.cwd(), а не import.meta.url: трассировка
// standalone-сборки кладёт файлы по относительному пути от корня — см. next.config.ts.
let regularTtf: Buffer | null = null;
let boldTtf: Buffer | null = null;

function regularFontFile(): Buffer {
  regularTtf ??= readFileSync(join(process.cwd(), "src", "lib", "pdf", "fonts", "DejaVuSans.ttf"));
  return regularTtf;
}

function boldFontFile(): Buffer {
  boldTtf ??= readFileSync(join(process.cwd(), "src", "lib", "pdf", "fonts", "DejaVuSans-Bold.ttf"));
  return boldTtf;
}

function hexToRgb(hex: string | null): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  const v = m ? m[1] : ACCENT_FALLBACK;
  return rgb(
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255
  );
}

/** Перенос по словам под ширину колонки (у pdf-lib автопереноса нет). */
function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (!cur || font.widthOfTextAtSize(cand, size) <= maxW) cur = cand;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, "dd.MM.yyyy");
}

function fmtMoney(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** Элемент вёрстки: строки после переноса + стиль. Блоки дней собираются из элементов,
 *  чтобы измерить высоту и не рвать карточку дня посередине страницы. */
interface Item {
  lines: string[];
  font: PDFFont;
  size: number;
  color: RGB;
  /** доп. отступ слева внутри колонки */
  x: number;
  gapBefore: number;
  /** нарисовать слева акцентную полосу дня высотой элемента */
  barColor?: RGB;
}

function dayItems(day: RoutePdfDay, sym: string, font: PDFFont, fontBold: PDFFont): Item[] {
  const W = CONTENT_W - 18;
  const items: Item[] = [
    {
      lines: wrapText(
        `День ${day.dayNumber} · ${formatDate(day.date)} · ${day.city}`,
        fontBold,
        14,
        W
      ),
      font: fontBold,
      size: 14,
      color: INK,
      x: 18,
      gapBefore: 12,
      barColor: hexToRgb(day.accentColor),
    },
  ];
  // Дефолтный автозаголовок «День N» дублирует шапку блока — пропускаем, как в UI
  if (day.title && day.title !== `День ${day.dayNumber}`) {
    items.push({ lines: wrapText(day.title, font, 10, W), font, size: 10, color: MUTED, x: 18, gapBefore: 2 });
  }
  if (day.summary) {
    items.push({ lines: wrapText(day.summary, font, 10, W), font, size: 10, color: MUTED, x: 18, gapBefore: 2 });
  }
  if (day.places.length === 0) {
    items.push({ lines: ["Мест пока нет"], font, size: 10, color: MUTED, x: 18, gapBefore: 4 });
    return items;
  }
  for (const section of daySections(day.places)) {
    if (section.key !== "all" && section.label) {
      items.push({
        lines: [section.label.toUpperCase()],
        font: fontBold,
        size: 9,
        color: MUTED,
        x: 18,
        gapBefore: 8,
      });
    }
    for (const p of section.places) {
      items.push({ lines: wrapText(p.name, fontBold, 11, W), font: fontBold, size: 11, color: INK, x: 18, gapBefore: 6 });
      const meta = [
        CATEGORY_SHORT[p.category] ?? p.category,
        p.address,
        p.budget != null ? `${fmtMoney(p.budget)} ${sym}` : null,
      ]
        .filter(Boolean)
        .join("  ·  ");
      if (meta) {
        items.push({ lines: wrapText(meta, font, 9, W), font, size: 9, color: MUTED, x: 18, gapBefore: 2 });
      }
      if (p.description) {
        items.push({ lines: wrapText(p.description, font, 10, W), font, size: 10, color: INK, x: 18, gapBefore: 2 });
      }
      if (p.notes) {
        items.push({ lines: wrapText(`Заметки: ${p.notes}`, font, 10, W), font, size: 10, color: MUTED, x: 18, gapBefore: 2 });
      }
    }
  }
  return items;
}

export async function buildRoutePdf(input: RoutePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regularFontFile(), { subset: true });
  const fontBold = await doc.embedFont(boldFontFile(), { subset: true });

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const sym = currencySymbol(input.currency);

  const newPage = (): void => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  /** Рисует элемент-строки; при нехватке места — новая страница. */
  const drawItem = (it: Item): void => {
    y -= it.gapBefore;
    if (it.barColor && y - it.size >= MARGIN + FOOTER_H) {
      page.drawRectangle({
        x: MARGIN - 12,
        y: y - it.size + 2,
        width: 3,
        height: it.lines.length * (it.size + 2),
        color: it.barColor,
      });
    }
    for (const ln of it.lines) {
      if (y - it.size < MARGIN + FOOTER_H) newPage();
      page.drawText(ln, { x: MARGIN + it.x, y: y - it.size, size: it.size, font: it.font, color: it.color });
      y -= it.size + 2;
    }
  };

  // Шапка документа (только первая страница)
  drawItem({ lines: wrapText(input.title, fontBold, 20, CONTENT_W), font: fontBold, size: 20, color: INK, x: 0, gapBefore: 0 });
  const dates = formatDate(input.startDate) + (input.endDate ? ` – ${formatDate(input.endDate)}` : "");
  drawItem({ lines: [`${input.destination} · ${dates}`], font, size: 11, color: MUTED, x: 0, gapBefore: 4 });
  drawItem({
    lines: [`Сгенерировано TripTrek · ${format(input.generatedAt, "dd.MM.yyyy")}`],
    font,
    size: 9,
    color: MUTED,
    x: 0,
    gapBefore: 2,
  });
  page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: PAGE_W - MARGIN, y: y - 4 }, thickness: 1, color: LINE_SOFT });
  y -= 12;

  // Дни: держим блок целиком на одной странице, если он туда помещается;
  // блок больше страницы режется между элементами (местами) через drawItem
  const fullPageH = PAGE_H - MARGIN * 2 - FOOTER_H;
  for (const day of input.days) {
    const items = dayItems(day, sym, font, fontBold);
    const blockH = items.reduce((h, it) => h + it.gapBefore + it.lines.length * (it.size + 2), 0);
    if (blockH <= fullPageH && y - blockH < MARGIN + FOOTER_H) newPage();
    for (const it of items) drawItem(it);
  }

  // Колонтитулы: количество страниц известно только после вёрстки
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `стр. ${i + 1} из ${pages.length}`;
    const w = font.widthOfTextAtSize(label, 9);
    p.drawText(label, { x: (PAGE_W - w) / 2, y: 20, size: 9, font, color: MUTED });
  });

  return doc.save();
}
```

- [ ] **Step 8: Прогнать тест билдера**

Run: `bun run test src/lib/pdf/route-pdf.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 9: Уточнить контракт в спеке (честность доков)**

В `docs/superpowers/specs/2026-10-06-route-pdf-export-design.md` в блоке «Контракт билдера» заменить комментарий `places: Place[];    // поля из select'а /api/route` на:

```ts
  places: RoutePdfPlace[]; // узкий структурный тип (name/category/timeOfDay/address/budget/description/notes);
                           // полный Place не подходит: prisma-строки дают Date, а не string.
                           // daySections обобщён под { timeOfDay } — см. src/lib/time-of-day.ts
```

- [ ] **Step 10: Линт и коммит**

```bash
bun run lint
git add package.json bun.lock src/lib/pdf src/lib/time-of-day.ts docs/superpowers/specs/2026-10-06-route-pdf-export-design.md
git commit -m "feat(pdf): чистый билдер маршрута в PDF (pdf-lib, DejaVu, кириллица)"
```

---

### Task 2: API-роут `GET /api/export/pdf`

**Files:**
- Create: `src/app/api/export/pdf/route.ts`

**Interfaces:**
- Consumes: `requireTripMember(req, tripId)` из `src/lib/api-auth.ts`; `buildRoutePdf(input: RoutePdfInput)` из Task 1; `db` из `src/lib/db`; `logger` из `src/lib/logger`.
- Produces: `GET /api/export/pdf?tripId=…` → `application/pdf` (attachment) | 400/401/403/404/500 JSON. Используется Task 3.

- [ ] **Step 1: Создать роут**

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTripMember } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { buildRoutePdf } from "@/lib/pdf/route-pdf";

// GET /api/export/pdf?tripId=... — маршрут поездки одним PDF (офлайн-просмотр).
// В отличие от JSON-бэкапа /api/export доступен всем участникам: это те же данные,
// что читает вкладка «Маршрут», без inviteCode и полного дампа.
export async function GET(req: NextRequest) {
  const tripId = new URL(req.url).searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  const { response } = await requireTripMember(req, tripId);
  if (response) return response;

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { title: true, destination: true, currency: true, startDate: true, endDate: true },
  });
  if (!trip) return NextResponse.json({ error: "Поездка не найдена" }, { status: 404 });

  // Выборка зеркалит GET /api/route (дни по порядку + места по order) — src/app/api/route/route.ts
  const days = await db.day.findMany({
    where: { tripId },
    orderBy: { dayNumber: "asc" },
    select: {
      dayNumber: true,
      date: true,
      city: true,
      title: true,
      summary: true,
      accentColor: true,
      places: {
        where: { tripId },
        orderBy: { order: "asc" },
        select: { name: true, category: true, timeOfDay: true, address: true, budget: true, description: true, notes: true },
      },
    },
  });

  if (!days.some((d) => d.places.length > 0)) {
    return NextResponse.json({ error: "Маршрут пуст — добавь дни и места" }, { status: 400 });
  }

  try {
    const bytes = await buildRoutePdf({
      title: trip.title,
      destination: trip.destination,
      currency: trip.currency,
      startDate: trip.startDate.toISOString(),
      endDate: trip.endDate ? trip.endDate.toISOString() : null,
      generatedAt: new Date(),
      // prisma отдаёт Date — контракту билдера нужны ISO-строки
      days: days.map((d) => ({ ...d, date: d.date.toISOString().slice(0, 10) })),
    });
    // filename* (RFC 5987) даёт кириллическое имя, filename — ASCII-fallback
    const safeName = `triptrek-${trip.title.replace(/[^\p{L}\p{N}-]+/gu, "-").slice(0, 40)}.pdf`;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="triptrek-route.pdf"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      },
    });
  } catch (e) {
    logger.error("pdf export failed", { tripId, error: String(e) });
    return NextResponse.json({ error: "Не удалось сформировать PDF" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Проверить линтом и типами**

Run: `bun run lint`
Expected: без ошибок.

- [ ] **Step 3: Коммит**

```bash
git add src/app/api/export/pdf/route.ts
git commit -m "feat(pdf): роут GET /api/export/pdf — гард участника, PDF-ответ"
```

---

### Task 3: Кнопка скачивания на вкладке «Маршрут»

**Files:**
- Modify: `src/components/trip/itinerary/Itinerary.tsx` (импорты ~строка 10, состояние ~строка 44, hero-кнопки ~строки 208–223)

**Interfaces:**
- Consumes: `GET /api/export/pdf?tripId=…` из Task 2; `tripId` (`useCurrentTripId`), `trip.settings.title` (`useTrip`) — уже есть в компоненте.
- Produces: пользовательский сценарий «нажал → файл в загрузках»; ничего для других задач.

- [ ] **Step 1: Добавить иконку и состояние**

В импорт lucide (строка 10) добавить `FileDown`:

```ts
import { CalendarPlus, Compass, FileDown, Loader2, Map as MapIcon, PartyPopper, Plane, Plus, Sparkles } from "lucide-react";
```

Рядом с остальными `useState` (после строки 44) добавить:

```ts
const [pdfLoading, setPdfLoading] = useState(false);
```

После `openAdd` (после строки 132) добавить обработчик — паттерн скачивания как в `data-backup.tsx`:

```ts
const downloadPdf = async () => {
  if (pdfLoading) return;
  setPdfLoading(true);
  try {
    const res = await fetch(`/api/export/pdf?tripId=${tripId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Не удалось сформировать PDF");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${trip.settings.title.replace(/[<>:"/\\|?*]+/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Маршрут скачан 📄");
  } catch (e) {
    toast.error("PDF не скачался", {
      description: e instanceof Error ? e.message : "Попробуйте ещё раз",
    });
  } finally {
    setPdfLoading(false);
  }
};
```

- [ ] **Step 2: Вставить кнопку в hero-ряд (после кнопки «На карте», ~строка 222)**

```tsx
<button
  type="button"
  onClick={downloadPdf}
  disabled={pdfLoading}
  aria-label="Скачать маршрут в PDF"
  title="Скачать маршрут в PDF"
  className="size-11 shrink-0 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur grid place-items-center transition-colors active:scale-[0.98] disabled:opacity-60"
>
  {pdfLoading ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
</button>
```

- [ ] **Step 3: Линт**

Run: `bun run lint`
Expected: без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add src/components/trip/itinerary/Itinerary.tsx
git commit -m "feat(pdf): кнопка скачивания PDF в шапке вкладки «Маршрут»"
```

---

### Task 4: Standalone-сборка + документация

**Files:**
- Modify: `next.config.ts:3-7`
- Modify: `docs/api.md`, `docs/glossary.md`, `AGENTS.md`, `worklog.md`

**Interfaces:**
- Consumes: путь шрифтов `src/lib/pdf/fonts/**` из Task 1.
- Produces: шрифты в standalone-сборке; актуальные доки.

- [ ] **Step 1: Трейсинг шрифтов в standalone**

В `next.config.ts` сразу после `output: "standalone"` добавить:

```ts
  // Шрифты PDF-экспорта читаются с диска в рантайме (src/lib/pdf/route-pdf.ts) —
  // без подсказки трейсер webpack не положит их в standalone-сборку
  outputFileTracingIncludes: {
    "/api/export/pdf": ["./src/lib/pdf/fonts/**"],
  },
```

- [ ] **Step 2: Обновить доки**

1. `docs/api.md` — найти строку про `GET /api/export` и рядом добавить:

```markdown
| `GET` | `/api/export/pdf?tripId=…` | Маршрут поездки одним PDF-файлом (офлайн). Любой участник поездки; 400, если нет мест |
```

(оформить по формату соседних строк таблицы).

2. `docs/glossary.md` — в разделе фич главного экрана рядом с описанием вкладки «Маршрут» добавить абзац:

```markdown
**PDF-экспорт маршрута** — кнопка в шапке вкладки «Маршрут» скачивает `GET /api/export/pdf`
(pdf-lib, вшитый DejaVu из-за кириллицы): дни с городами/датами, места по слотам времени с
адресом, бюджетом, описанием и заметками. Доступен всем участникам; билдер — чистая функция
`src/lib/pdf/route-pdf.ts` (тесты в `route-pdf.test.ts`).
```

3. `AGENTS.md` — в карте репозитория в строке `src/lib/` дописать в перечисление: `pdf/route-pdf.ts (генерация PDF маршрута: DejaVu-шрифты, переносы, колонтитулы)`.

4. `worklog.md` — записью сверху добавить пункт: «PDF-экспорт маршрута: /api/export/pdf + buildRoutePdf (pdf-lib) + кнопка в Itinerary; шрифты через outputFileTracingIncludes».

- [ ] **Step 3: Линт, тесты и коммит**

```bash
bun run lint && bun run test
git add next.config.ts docs/api.md docs/glossary.md AGENTS.md worklog.md
git commit -m "feat(pdf): шрифты в standalone-сборке + документация"
```

---

### Task 5: Ручная QA в браузере (только главный агент — browser-use)

**Files:** ничего не создаёт; проверяет Tasks 1–4.

**Interfaces:**
- Consumes: dev-сервер `bun server.ts` на `:3000`, тестовый аккаунт `you@triptrek.com` / `1234` (сид «Китай»).

- [ ] **Step 1: Поднять dev-сервер**

```bash
bun run db:up   # если Postgres не поднят
bun server.ts
```

- [ ] **Step 2: Проверить сценарий через browser-use (skill `browser-use:control-browser`)**

1. Открыть `http://localhost:3000`, войти `you@triptrek.com` / `1234`.
2. Вкладка «Маршрут» → в hero-блоке нажать кнопку PDF (иконка FileDown).
3. Убедиться: началась загрузка файла, имя содержит название поездки, файл открывается как PDF.
4. Открыть скачанный файл: кириллица читаема, дни с городами и датами, места сгруппированы по «УТРО/ДЕНЬ/ВЕЧЕР», есть колонтитулы, бюджет места с символом валюты.
5. Смотреть console-логи страницы: нет ошибок.
6. Проверить 400-флоу: `curl -s "http://localhost:3000/api/export/pdf?tripId=<id-пустой-поездки>" -b <cookie>` — либо, если пустой поездки нет, убедиться, что тост об ошибке показывается при сбое (открыть URL роута без tripId → 400).

- [ ] **Step 3: Финальный статус**

Если всё зелёное — задача выполнена; недочёты заводить как правки в соответствующих задачах (не новый план).

Проверку скачивания на реальном телефоне (мобильный PWA: iOS Safari, Android Chrome, открытие офлайн) агент не выполняет — этот пункт из спеки остаётся за владельцем после деплоя.
