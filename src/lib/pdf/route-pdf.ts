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
