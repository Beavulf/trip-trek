// Обучение (welcome-tour) и интерактивные обучалки вкладок.
// Файл умышленно без React: шаги/подсказки — данные, storage — чистые функции,
// покрытые юнит-тестами. Статус «пройдено» живёт на аккаунте
// (User.onboardingCompletedAt), локальная тень в localStorage страхует от
// повторного открытия, пока PATCH не долетел (офлайн/обрыв).

import type { TripTab } from "./trip-store";

// === Приветственный тур: 5 шагов, по одной мысли на шаг ===

export interface TourStep {
  id: string;
  art: "welcome" | "tabs" | "quickadd" | "invite" | "done";
  title: string;
  text: string;
  /** Своя надпись основной кнопки (по умолчанию «Далее») */
  cta?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    art: "welcome",
    title: "Добро пожаловать в TripTrek!",
    text: "Маршрут, бюджет, карта и воспоминания поездки — в одном месте, вместе с друзьями.",
  },
  {
    id: "tabs",
    art: "tabs",
    title: "Всё — по вкладкам",
    text: "Разделы поездки — во вкладках сверху: обзор, маршрут, карта, бюджет и другие.",
  },
  {
    id: "quickadd",
    art: "quickadd",
    title: "Кнопка «+» — главный помощник",
    text: "Трата, фото и заметка — кнопкой «+» из любого раздела. Места добавляются на Маршруте и Карте.",
  },
  {
    id: "invite",
    art: "invite",
    title: "Планируйте вместе",
    text: "Пригласите друзей по коду или ссылке — все изменения видны каждому сразу.",
  },
  {
    id: "done",
    art: "done",
    title: "Готово!",
    text: "На каждой вкладке вас встретит короткое обучение с её фичами. Пройти всё заново можно в Профиле.",
    cta: "Всё ясно",
  },
];

// === Обучалки вкладок: открываются при первом визите вкладки, один раз ===
// Контент сверен с кодом фич (кнопки/поведение) — при изменении фич править здесь.

export type TabTourIcon =
  | "layout"
  | "rss"
  | "calendar"
  | "list"
  | "map-pin"
  | "map"
  | "route"
  | "sliders"
  | "crosshair"
  | "wallet"
  | "receipt"
  | "users"
  | "arrows"
  | "coffee"
  | "star"
  | "languages"
  | "sparkles"
  | "maximize"
  | "volume"
  | "user-plus"
  | "crown"
  | "filter";

export interface TabTourStep {
  id: string;
  icon: TabTourIcon;
  title: string;
  text: string;
  /** Подписи-пилюли на иллюстрации (конкретный UI-язык фичи) */
  chips?: string[];
}

export interface TabTourDef {
  tab: TripTab;
  /** Подзаголовок карточки — имя вкладки */
  eyebrow: string;
  steps: TabTourStep[];
}

export const TAB_TOURS: TabTourDef[] = [
  {
    tab: "dashboard",
    eyebrow: "Обзор",
    steps: [
      {
        id: "dash-summary",
        icon: "layout",
        title: "Всё главное — здесь",
        text: "Сводка поездки: текущий день, прогресс по местам, бюджет и следующая точка маршрута.",
        chips: ["День 3/12", "0 из 8 мест"],
      },
      {
        id: "dash-invite",
        icon: "user-plus",
        title: "Позовите друзей",
        text: "«Позвать друзей» даёт код и ссылку. Состав и его управление — в «О поездке» и «Пригласить друзей».",
        chips: ["Код: SUMMER26"],
      },
      {
        id: "dash-owner",
        icon: "crown",
        title: "Владелец держит порядок",
        text: "Владелец может исключить или заблокировать участника, а также передать владение — кнопки у каждого в списке состава.",
        chips: ["Исключить", "Заблокировать", "Передать владение"],
      },
    ],
  },
  {
    tab: "timeline",
    eyebrow: "Лента",
    steps: [
      {
        id: "tl-what",
        icon: "rss",
        title: "Хроника поездки",
        text: "Лента собирает всё, что произошло: посещённые места, фото, траты, записи дневника и новых участников.",
        chips: ["📍 Места", "📸 Фото", "💸 Траты", "📔 Дневник"],
      },
      {
        id: "tl-jump",
        icon: "filter",
        title: "Фильтры и переходы",
        text: "Пилюли сверху оставят только нужные события, а тап по событию откроет его раздел — маршрут, галерею или бюджет.",
      },
    ],
  },
  {
    tab: "itinerary",
    eyebrow: "Маршрут",
    steps: [
      {
        id: "it-days",
        icon: "calendar",
        title: "Дни маршрута",
        text: "День — это город. «Добавить день» берёт следующий номер, дата подставится сама: день №N = дата старта + N−1.",
        chips: ["Добавить день", "День 4 · Киото"],
      },
      {
        id: "it-places",
        icon: "list",
        title: "Места по слотам времени",
        text: "В карточке дня «Добавить место»: выберите Утро, День или Вечер — порядок дня построится сам.",
        chips: ["Утро", "День", "Вечер"],
      },
      {
        id: "it-map",
        icon: "map-pin",
        title: "Точка прямо на карте",
        text: "В форме места нажмите «Выбрать на карте»: перетащите карту — адрес подставится автоматически.",
        chips: ["Выбрать на карте"],
      },
      {
        id: "it-card",
        icon: "list",
        title: "Карточка места",
        text: "Тап по месту: отметить посещённым, построить маршрут до него, прикрепить фото и заметки.",
        chips: ["Посещено 🎉", "Маршрут"],
      },
    ],
  },
  {
    tab: "map",
    eyebrow: "Карта",
    steps: [
      {
        id: "mp-markers",
        icon: "map",
        title: "Все места — на карте",
        text: "Маркеры с адресами: серые — запланировано, зелёные — посещено. Тап по маркеру откроет карточку места.",
        chips: ["Запланировано", "Посещено"],
      },
      {
        id: "mp-lines",
        icon: "route",
        title: "Цветные линии",
        text: "Нити соединяют места одного дня по порядку, цвет = цвет дня. Сплошная — пройдено, пунктир — ещё впереди.",
      },
      {
        id: "mp-filters",
        icon: "sliders",
        title: "Фильтры и стиль",
        text: "Города, только непосещённые, кафе и бары, фото на карте. Стиль карты: классика, спутник или тёмная.",
        chips: ["Только непосещённые", "Спутник"],
      },
      {
        id: "mp-add",
        icon: "crosshair",
        title: "Добавить прямо с карты",
        text: "Кнопка «+» включает прицел: перетащите карту под точку — и добавьте место с готовым адресом.",
        chips: ["Добавить здесь"],
      },
    ],
  },
  {
    tab: "budget",
    eyebrow: "Бюджет",
    steps: [
      {
        id: "bg-personal",
        icon: "wallet",
        title: "Бюджет каждого",
        text: "«Настроить» в блоке «Бюджет каждого» задаёт личный лимит участника. Общий бюджет — сумма личных.",
        chips: ["Бюджет каждого", "Настроить"],
      },
      {
        id: "bg-add",
        icon: "receipt",
        title: "Траты — и итоги сразу",
        text: "«Добавить трату»: сумма в любой валюте, кто заплатил и за кого. Балансы пересчитываются мгновенно.",
        chips: ["Кто заплатил?", "За кого?"],
      },
      {
        id: "bg-debts",
        icon: "users",
        title: "Долги посчитаются сами",
        text: "Плата «за других» разложится на долги: блок «Расчёт между друзьями» покажет, кто кому сколько должен.",
        chips: ["A → B: $12"],
      },
      {
        id: "bg-settle",
        icon: "arrows",
        title: "Вернули — отметьте",
        text: "Кнопка «Перевели» подтверждает возврат: долг гаснет, а перевод остаётся в истории трат.",
        chips: ["Перевели", "Долгов нет 🎉"],
      },
    ],
  },
  {
    tab: "rest",
    eyebrow: "Chill",
    steps: [
      {
        id: "ch-sections",
        icon: "coffee",
        title: "Три раздела",
        text: "«Маршрут» — кафе и бары из плана, «Хочу» — ваш список желаний, «Рядом» — что есть поблизости.",
        chips: ["Маршрут", "Хочу", "Рядом"],
      },
      {
        id: "ch-nearby",
        icon: "map-pin",
        title: "«Рядом»",
        text: "Кафе, бары и рестораны вокруг вас — данные OpenStreetMap, радиус 500 м–3 км настраивается.",
        chips: ["Кафе ☕", "Рестораны 🍽️", "Бары 🍸"],
      },
      {
        id: "ch-wish",
        icon: "star",
        title: "«Хочу посетить»",
        text: "Понравилось место из «Рядома»? «Хочу посетить» добавит его в личный вишлист — он виден только вам.",
      },
    ],
  },
  {
    tab: "phrases",
    eyebrow: "Фразы",
    steps: [
      {
        id: "ph-pack",
        icon: "languages",
        title: "Язык — целым набором",
        text: "«Загрузить набор» добавит пачку готовых фраз для 9 языков сразу: основы, еда, транспорт, экстренные.",
        chips: ["Загрузить набор"],
      },
      {
        id: "ph-ai",
        icon: "sparkles",
        title: "Любой язык через ИИ",
        text: "Страны нет в списке? ИИ соберёт набор почти для любого языка — интернет нужен один раз, дальше офлайн.",
        chips: ["Собрать ИИ"],
      },
      {
        id: "ph-card",
        icon: "maximize",
        title: "Карточка на весь экран",
        text: "Тап по фразе — крупно на весь экран: свайп листает, есть медленная озвучка и копирование.",
        chips: ["Медленно 🐢", "Копировать"],
      },
      {
        id: "ph-tts",
        icon: "volume",
        title: "Голос телефона",
        text: "Озвучка — системный голос телефона. Если молчит: скачайте язык страны в настройках речи (TTS) телефона.",
      },
    ],
  },
];

// === Локальные отметки устройства (SSR-safe, отказоустойчивые к private mode) ===

const localDoneKey = (userId: string) => `triptrek-tour-local-done:${userId}`;
const seenToursKey = (userId: string) => `triptrek-tabtour-seen:${userId}`;

/** Локальная тень «тур закрыт»: защищает от повторного открытия, пока PATCH в пути/потерялся. */
export function readLocalTourDone(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(localDoneKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeLocalTourDone(userId: string | null | undefined, done: boolean): void {
  if (!userId || typeof window === "undefined") return;
  try {
    if (done) window.localStorage.setItem(localDoneKey(userId), "1");
    else window.localStorage.removeItem(localDoneKey(userId));
  } catch {
    // private mode / переполненная квота — обучение просто покажется снова, не страшно
  }
}

/** Обучалки вкладок, уже показанные на этом устройстве. null = ещё не читали. */
export function readSeenTabTours(userId: string | null | undefined): string[] | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(seenToursKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

/** Отметить обучалку вкладки показанной; возвращает обновлённый список (дедупликация). */
export function writeSeenTabTour(userId: string | null | undefined, tab: string): string[] {
  const current = readSeenTabTours(userId) ?? [];
  if (current.includes(tab)) return current;
  const next = [...current, tab];
  if (userId && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(seenToursKey(userId), JSON.stringify(next));
    } catch {
      // как выше: приватный режим — обучалки будут показываться заново
    }
  }
  return next;
}

/** «Пройти заново» — обучалки вкладок тоже с чистого листа. */
export function clearSeenTabTours(userId: string | null | undefined): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(seenToursKey(userId));
  } catch {
    // игнорируем — см. выше
  }
}
