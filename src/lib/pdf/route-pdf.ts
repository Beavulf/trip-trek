// Чистый билдер PDF маршрута: данные → байты, без БД и fetch (тестируется в vitest).
// Кириллицу стандартные шрифты PDF не поддерживают, поэтому вшиваем DejaVu subset'ом. Названия и
// адреса бывают на языке страны, а в DejaVu нет многих письменностей: для них есть запасные шрифты,
// и строка рисуется кусками, каждый своим шрифтом (см. runsOf).
// Должно идти до fontkit: его разбор сложных письменностей (хинди, кхмерский, бирманский) написан
// на регенераторах и ждёт глобальный regeneratorRuntime; без него PDF падал на таком тексте.
import "regenerator-runtime/runtime";
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
  /** Где ночуем в этот день */
  night?: { name: string; address: string | null } | null;
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
// на каждый запрос незачем). process.cwd(), а не import.meta.url (тот указал бы
// внутрь .next, где шрифтов нет): путь от корня одинаков в dev (корень репо)
// и в проде — Dockerfile копирует src/lib целиком и запускает `bun server.ts`
// из /app, без .next/standalone. outputFileTracingIncludes в next.config.ts —
// запас на будущее, если переедем на standalone-раскладку.
const fontFiles = new Map<string, Buffer>();

function fontFile(name: string): Buffer {
  let file = fontFiles.get(name);
  if (!file) {
    file = readFileSync(join(process.cwd(), "src", "lib", "pdf", "fonts", name));
    fontFiles.set(name, file);
  }
  return file;
}

// Запасные шрифты подключаем, только если такая письменность есть в поездке: иероглифы весят 6 МБ.
// Жирного начертания у них нет: заголовок на местном языке выйдет обычным, это лучше пустых квадратов.
const FALLBACK_FONTS: { file: string; script: RegExp }[] = [
  { file: "NotoSansCJK-Subset.ttf", script: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u },
  { file: "NotoSansThai-Regular.ttf", script: /\p{Script=Thai}/u },
  { file: "NotoSansDevanagari-Regular.ttf", script: /\p{Script=Devanagari}/u },
  { file: "NotoSansBengali-Regular.ttf", script: /\p{Script=Bengali}/u },
  { file: "NotoSansTamil-Regular.ttf", script: /\p{Script=Tamil}/u },
  { file: "NotoSansSinhala-Regular.ttf", script: /\p{Script=Sinhala}/u },
  { file: "NotoSansKhmer-Regular.ttf", script: /\p{Script=Khmer}/u },
  { file: "NotoSansMyanmar-Regular.ttf", script: /\p{Script=Myanmar}/u },
  { file: "NotoSansEthiopic-Regular.ttf", script: /\p{Script=Ethiopic}/u },
];

interface LoadedFont {
  font: PDFFont;
  chars: Set<number>;
}

/** Начертание: основной шрифт и запасные на письменности, которых в нём нет */
interface Face {
  primary: LoadedFont;
  fallbacks: LoadedFont[];
}

const loaded = (font: PDFFont): LoadedFont => ({ font, chars: new Set(font.getCharacterSet()) });

interface Run {
  text: string;
  font: PDFFont;
}

// Пробелы, цифры и знаки не привязаны к письменности: остаются в текущем куске своего шрифта
const NEUTRAL = /[\s\p{N}\p{P}\p{S}\p{M}]/u;

/** Куски одного шрифта в порядке текста */
function fontRuns(text: string, face: Face): Run[] {
  const runs: Run[] = [];
  let cur: { text: string; loaded: LoadedFont } | null = null;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const keepsRun = cur !== null && NEUTRAL.test(ch) && (cur.loaded.chars.has(cp) || /\p{M}/u.test(ch));
    const font: LoadedFont = keepsRun
      ? cur!.loaded
      : face.primary.chars.has(cp)
        ? face.primary
        : (face.fallbacks.find((f) => f.chars.has(cp)) ?? face.primary);
    if (cur && cur.loaded === font) cur.text += ch;
    else {
      if (cur) runs.push({ text: cur.text, font: cur.loaded.font });
      cur = { text: ch, loaded: font };
    }
  }
  if (cur) runs.push({ text: cur.text, font: cur.loaded.font });
  return runs;
}

// Участок текста справа налево: от первой до последней буквы арабского или иврита
const RTL_SPAN = /[\p{Script=Hebrew}\p{Script=Arabic}](?:\P{L}*[\p{Script=Hebrew}\p{Script=Arabic}])*/gu;
const NUMBER = /(\p{N}+(?:[.,:/-]\p{N}+)*)/u;

/**
 * Строка → куски в порядке рисования слева направо. Смешанные строки («Ночуем: 东枫公寓») иначе не
 * нарисовать. Буквы внутри куска справа налево разворачивает fontkit, но он разворачивает и числа
 * («дом 12» выходил как «21»), поэтому числа — отдельные куски, а весь участок идёт в обратном порядке.
 */
function runsOf(text: string, face: Face): Run[] {
  const runs: Run[] = [];
  let at = 0;
  for (const m of text.matchAll(RTL_SPAN)) {
    runs.push(...fontRuns(text.slice(at, m.index), face));
    for (const part of m[0].split(NUMBER).filter(Boolean).reverse()) runs.push(...fontRuns(part, face));
    at = m.index + m[0].length;
  }
  runs.push(...fontRuns(text.slice(at), face));
  return runs;
}

function textWidth(text: string, face: Face, size: number): number {
  return runsOf(text, face).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);
}

function canPrint(text: string, face: Face): boolean {
  const all = [face.primary, ...face.fallbacks];
  return [...text].every((c) => /\s/.test(c) || all.some((f) => f.chars.has(c.codePointAt(0)!)));
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

// Китайский и японский пишут без пробелов: переносить можно между любыми знаками,
// иначе длинный адрес целиком уходил за правый край страницы
const WRAP_TOKEN = /\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu;

/** Перенос под ширину колонки (у pdf-lib автопереноса нет). */
function wrapText(text: string, face: Face, size: number, maxW: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const token of text.match(WRAP_TOKEN) ?? []) {
    const space = /^\s/.test(token);
    if (space && !cur) continue;
    const cand = cur + (space ? " " : token);
    if (!cur || space || textWidth(cand, face, size) <= maxW) cur = cand;
    else {
      lines.push(cur.trimEnd());
      cur = token;
    }
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines;
}

/** Календарный день читается из самой даты: на сервере и у зрителя свои пояса */
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** Элемент вёрстки: строки после переноса + стиль. Блоки дней собираются из элементов,
 *  чтобы измерить высоту и не рвать карточку дня посередине страницы. */
interface Item {
  lines: string[];
  face: Face;
  size: number;
  color: RGB;
  /** доп. отступ слева внутри колонки */
  x: number;
  gapBefore: number;
  /** нарисовать слева акцентную полосу дня высотой элемента */
  barColor?: RGB;
}

function dayItems(day: RoutePdfDay, sym: string, face: Face, faceBold: Face): Item[] {
  const W = CONTENT_W - 18;
  const items: Item[] = [
    {
      lines: wrapText(
        `День ${day.dayNumber} · ${formatDate(day.date)} · ${day.city}`,
        faceBold,
        14,
        W
      ),
      face: faceBold,
      size: 14,
      color: INK,
      x: 18,
      gapBefore: 12,
      barColor: hexToRgb(day.accentColor),
    },
  ];
  // Дефолтный автозаголовок «День N» дублирует шапку блока — пропускаем, как в UI
  if (day.title && day.title !== `День ${day.dayNumber}`) {
    items.push({ lines: wrapText(day.title, face, 10, W), face, size: 10, color: MUTED, x: 18, gapBefore: 2 });
  }
  if (day.summary) {
    items.push({ lines: wrapText(day.summary, face, 10, W), face, size: 10, color: MUTED, x: 18, gapBefore: 2 });
  }
  if (day.night) {
    // Письменность вне всех шрифтов превратила бы адрес в пустые квадраты: тогда хватит названия
    const place = day.night.address && canPrint(day.night.address, face) ? `${day.night.name}, ${day.night.address}` : day.night.name;
    items.push({ lines: wrapText(`Ночуем: ${place}`, face, 10, W), face, size: 10, color: INK, x: 18, gapBefore: 2 });
  }
  if (day.places.length === 0) {
    items.push({ lines: ["Мест пока нет"], face, size: 10, color: MUTED, x: 18, gapBefore: 4 });
    return items;
  }
  for (const section of daySections(day.places)) {
    if (section.key !== "all" && section.label) {
      items.push({
        lines: [section.label.toUpperCase()],
        face: faceBold,
        size: 9,
        color: MUTED,
        x: 18,
        gapBefore: 8,
      });
    }
    for (const p of section.places) {
      items.push({ lines: wrapText(p.name, faceBold, 11, W), face: faceBold, size: 11, color: INK, x: 18, gapBefore: 6 });
      const meta = [
        CATEGORY_SHORT[p.category] ?? p.category,
        p.address,
        p.budget != null ? `${fmtMoney(p.budget)} ${sym}` : null,
      ]
        .filter(Boolean)
        .join("  ·  ");
      if (meta) {
        items.push({ lines: wrapText(meta, face, 9, W), face, size: 9, color: MUTED, x: 18, gapBefore: 2 });
      }
      if (p.description) {
        items.push({ lines: wrapText(p.description, face, 10, W), face, size: 10, color: INK, x: 18, gapBefore: 2 });
      }
      if (p.notes) {
        items.push({ lines: wrapText(`Заметки: ${p.notes}`, face, 10, W), face, size: 10, color: MUTED, x: 18, gapBefore: 2 });
      }
    }
  }
  return items;
}

/** Весь текст поездки: по нему решаем, какие запасные шрифты нужны документу */
function tripText(input: RoutePdfInput): string {
  const parts = [input.title, input.destination];
  for (const d of input.days) {
    parts.push(d.city, d.title, d.summary ?? "", d.night?.name ?? "", d.night?.address ?? "");
    for (const p of d.places) parts.push(p.name, p.address ?? "", p.description ?? "", p.notes ?? "");
  }
  return parts.join(" ");
}

export async function buildRoutePdf(input: RoutePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontFile("DejaVuSans.ttf"), { subset: true });
  const fontBold = await doc.embedFont(fontFile("DejaVuSans-Bold.ttf"), { subset: true });

  const allText = tripText(input);
  const fallbacks: LoadedFont[] = [];
  for (const { file, script } of FALLBACK_FONTS) {
    if (script.test(allText)) fallbacks.push(loaded(await doc.embedFont(fontFile(file), { subset: true })));
  }
  const face: Face = { primary: loaded(font), fallbacks };
  const faceBold: Face = { primary: loaded(fontBold), fallbacks };

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
      let x = MARGIN + it.x;
      for (const run of runsOf(ln, it.face)) {
        page.drawText(run.text, { x, y: y - it.size, size: it.size, font: run.font, color: it.color });
        x += run.font.widthOfTextAtSize(run.text, it.size);
      }
      y -= it.size + 2;
    }
  };

  // Шапка документа (только первая страница)
  drawItem({ lines: wrapText(input.title, faceBold, 20, CONTENT_W), face: faceBold, size: 20, color: INK, x: 0, gapBefore: 0 });
  const dates = formatDate(input.startDate) + (input.endDate ? ` – ${formatDate(input.endDate)}` : "");
  drawItem({ lines: [`${input.destination} · ${dates}`], face, size: 11, color: MUTED, x: 0, gapBefore: 4 });
  drawItem({
    lines: [`Сгенерировано TripTrek · ${format(input.generatedAt, "dd.MM.yyyy")}`],
    face,
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
    const items = dayItems(day, sym, face, faceBold);
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
