// Вкладка «Инфо»: чистая логика двух разделов, чек-листа и справки, без React и БД.
// Покрыта info-page.test.ts.

import type { ChecklistItem } from "@/hooks/trip/use-checklist";
import type { InfoItem } from "@/hooks/trip/use-info";

export type InfoView = "checklist" | "reference";

export const CHECKLIST_CATS: Record<string, { label: string; emoji: string }> = {
  documents: { label: "Документы", emoji: "📄" },
  health: { label: "Здоровье", emoji: "💊" },
  preparation: { label: "Подготовка", emoji: "🎒" },
  packing_there: { label: "Сборы туда", emoji: "🧳" },
  packing_back: { label: "Сборы обратно", emoji: "↩️" },
  other: { label: "Другое", emoji: "📌" },
};

export const INFO_TYPES: Record<string, { label: string; emoji: string; hint: string }> = {
  contact: { label: "Контакты", emoji: "📞", hint: "Номера телефонов: позвонить можно в одно касание" },
  transport: { label: "Транспорт", emoji: "🚇", hint: "Как добраться, какие приложения и билеты нужны" },
  food: { label: "Еда", emoji: "🍽️", hint: "Что важно знать о еде и воде" },
  tip: { label: "Советы", emoji: "💡", hint: "Оплата, связь, чаевые и другие мелочи" },
  other: { label: "Другое", emoji: "📌", hint: "" },
};

/** Готовые наборы для шаблонов чек-листа */
export const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  documents: [
    "Паспорт",
    "Виза / электронное разрешение",
    "Медстраховка (полис)",
    "Авиабилеты",
    "Бронь отеля",
    "Банковские карты (две разные)",
    "Наличные в валюте страны",
    "Копии документов (бумага + облако)",
  ],
  health: [
    "Личные лекарства",
    "Базовая аптечка (жаропонижающее, пластыри)",
    "Средство от солнца",
    "Рецепты на препараты (латиницей)",
    "Санитайзер и маски",
  ],
  preparation: [
    "Офлайн-карты города",
    "Уведомить банк о поездке",
    "Проверить визовые требования",
    "Установить eSIM / включить роуминг",
    "Скачать фильмы в дорогу",
    "Записать адрес отеля без интернета",
  ],
  packing_there: [
    "Документы в ручную кладь",
    "Зарядка + адаптер розеток",
    "Powerbank",
    "Удобная обувь",
    "Одежда по погоде",
    "Гигиена (щётка, паста)",
    "Наушники",
  ],
  packing_back: [
    "Место в чемодане под сувениры",
    "Техника заряжена",
    "Паспорт и билеты под рукой",
    "Проверить сейф и розетки",
    "Чеки для tax free",
  ],
  other: ["Купить подарки близким", "Проверить погоду перед вылетом", "Заказать трансфер"],
};

export interface ReferencePreset {
  type: string;
  title: string;
}

/** С чего начать справку: то, что понадобится внезапно и искать будет некогда */
export const REFERENCE_PRESETS: ReferencePreset[] = [
  { type: "contact", title: "Экстренные службы" },
  { type: "contact", title: "Консульство" },
  { type: "contact", title: "Страховая" },
  { type: "transport", title: "Как добраться из аэропорта" },
  { type: "tip", title: "Оплата и обмен валюты" },
  { type: "tip", title: "Интернет и связь" },
];

const normText = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export const hasChecklistText = (items: readonly ChecklistItem[], text: string) =>
  items.some((i) => normText(i.text) === normText(text));

/**
 * Какой раздел открыть. До поездки важнее собраться, а в дороге и после нужны номера и подсказки:
 * раньше справка лежала под чек-листом, на пятом экране.
 */
export function defaultInfoView(startKey: string | null, todayKey: string): InfoView {
  return startKey && todayKey < startKey ? "checklist" : "reference";
}

export interface ChecklistGroup {
  cat: string;
  label: string;
  emoji: string;
  pending: ChecklistItem[];
  done: ChecklistItem[];
  total: number;
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

/** Группы в постоянном порядке, пустых нет. Чужая категория (импорт) попадает в «Другое», а не теряется */
export function groupChecklist(items: readonly ChecklistItem[]): ChecklistGroup[] {
  const known = (cat: string) => (cat in CHECKLIST_CATS ? cat : "other");
  return Object.entries(CHECKLIST_CATS)
    .map(([cat, meta]) => {
      const inCat = items.filter((i) => known(i.category) === cat).sort(byOrder);
      return {
        cat,
        ...meta,
        pending: inCat.filter((i) => !i.done),
        done: inCat.filter((i) => i.done),
        total: inCat.length,
      };
    })
    .filter((g) => g.total > 0);
}

export function checklistProgress(items: readonly ChecklistItem[]) {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  return { total, done, pending: total - done, pct: total ? Math.round((done / total) * 100) : 0 };
}

export interface ReferenceGroup {
  type: string;
  label: string;
  emoji: string;
  items: InfoItem[];
}

/** Запись неизвестного типа раньше не показывалась вовсе: группы строились только по известным */
export function groupReference(items: readonly InfoItem[]): ReferenceGroup[] {
  const known = (type: string) => (type in INFO_TYPES ? type : "other");
  return Object.entries(INFO_TYPES)
    .map(([type, meta]) => ({
      type,
      label: meta.label,
      emoji: meta.emoji,
      items: items.filter((i) => known(i.type) === type).sort(byOrder),
    }))
    .filter((g) => g.items.length > 0);
}

export interface CallTarget {
  /** Для tel: только цифры и плюс */
  number: string;
  /** Что за номер: «полиция», «Отель» */
  label: string;
}

const LONG_PHONE = /\+?\d[\d\s\-()]{4,}\d/g;
const SHORT_CODE = /(?<![\d+])\d{3,4}(?!\d)/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Короткие номера берём только там, где речь о службах: иначе дом 123 в адресе стал бы кнопкой звонка
const EMERGENCY = /экстрен|служб|полиц|скор|пожар|спас|медиц|emergency|police|ambulance|fire|rescue|sos/i;
const LABEL_EDGE = /^[\s:—–\-.()]+|[\s:—–\-.()]+$/g;

function targetsIn(part: string, shortCodes: boolean): CallTarget[] {
  const found: { raw: string }[] = [];
  let rest = part;
  for (const m of part.match(LONG_PHONE) ?? []) {
    const digits = m.replace(/\D/g, "");
    // Цена «15 000» и дата похожи на телефон: считаем номером плюс или хотя бы семь цифр
    const looksLikePhone = (m.startsWith("+") || digits.length >= 7) && digits.length <= 15 && !ISO_DATE.test(m.trim());
    if (!looksLikePhone) continue;
    found.push({ raw: m });
    rest = rest.replace(m, " ");
  }
  if (shortCodes) {
    for (const m of rest.match(SHORT_CODE) ?? []) {
      found.push({ raw: m });
      rest = rest.replace(m, " ");
    }
  }
  const label = rest.replace(LABEL_EDGE, "").replace(/\s+/g, " ").slice(0, 24);
  return found.map(({ raw }) => ({ number: `${raw.trim().startsWith("+") ? "+" : ""}${raw.replace(/\D/g, "")}`, label }));
}

/** Куда можно позвонить из записи. «110 — полиция, 120 — скорая» — это две кнопки, а не текст */
export function findCallTargets(item: Pick<InfoItem, "type" | "title" | "content">): CallTarget[] {
  const aboutServices = item.type === "contact" && EMERGENCY.test(item.title);
  const seen = new Set<string>();
  return item.content
    .split(/[,;\n]/)
    .flatMap((part) => targetsIn(part, aboutServices || (item.type === "contact" && EMERGENCY.test(part))))
    .filter((t) => (seen.has(t.number) ? false : (seen.add(t.number), true)));
}

const URL_RE = /https?:\/\/[^\s<>"']+/;

export function findUrl(s: string): string | null {
  return s.match(URL_RE)?.[0] ?? null;
}
