// Содержимое обучения: приветственный тур, туры вкладок, «Сочтёмся».
// Только данные (без React): шаги и мини-макеты проверяются тестами, в том числе
// сверкой подписей кнопок с исходниками (labels) — текст не расходится с интерфейсом.
// Менялась кнопка в интерфейсе — правьте здесь и в labels; упал тест = обучение устарело.

import type { MockScene } from "./onboarding-scene";
import type { TripTab } from "./trip-store";

export type TourRole = "owner" | "member" | "viewer";
const ALL_ROLES: TourRole[] = ["owner", "member", "viewer"];
const EDITORS: TourRole[] = ["owner", "member"];

/** Что делает кнопка «Попробовать» в шаге (исполняет TourHost) */
export type StepActionKind =
  | `tab:${TripTab}`
  | "quickadd:photo"
  | "quickadd:expense"
  | "quickadd:journal"
  | "invite"
  | "profile-ai"
  | "split";

export interface TourStepDef {
  id: string;
  title: string;
  text: string;
  /** Мини-макет шага; art — готовые крупные иллюстрации для вступления и финала */
  scene?: MockScene;
  art?: "welcome" | "done";
  /** Для каких ролей шаг показывается (по умолчанию для всех) */
  roles?: TourRole[];
  /** Своя надпись основной кнопки (по умолчанию «Далее») */
  cta?: string;
  /** Кнопка «Попробовать» — закрывает тур (его можно продолжить) и делает действие */
  action?: { label: string; do: StepActionKind };
  /**
   * Подписи из интерфейса, на которые ссылается шаг. Тест проверяет, что каждая
   * найдена в исходниках приложения — так текст не разойдётся с кнопками.
   */
  labels?: string[];
}

export type TourKind = "welcome" | "tab" | "split";
export type TourGroup = "start" | "plan" | "memories" | "road" | "together" | "split";

export interface TourDef {
  id: string;
  kind: TourKind;
  /** Для kind "tab": вкладка, на которой тур открывается сам */
  tab?: TripTab;
  /** Для kind "split": экран «Сочтёмся», где тур открывается сам */
  splitScreen?: "hub" | "group";
  /** Название для карточки тура и Центра обучения */
  title: string;
  /** Короткое описание для Центра обучения */
  about: string;
  group: TourGroup;
  steps: TourStepDef[];
}

export const TOUR_GROUP_LABELS: Record<TourGroup, string> = {
  start: "Начало",
  plan: "Планирование",
  memories: "Воспоминания",
  road: "В дороге",
  together: "Вместе",
  split: "Сочтёмся",
};

/** Шаги тура для роли; пустой результат = тур этой роли не нужен */
export function stepsFor(def: TourDef, role: TourRole | null): TourStepDef[] {
  const r = role ?? "owner";
  return def.steps.filter((s) => (s.roles ?? ALL_ROLES).includes(r));
}

// === Приветственный тур ===

const WELCOME: TourDef = {
  id: "welcome",
  kind: "welcome",
  title: "Знакомство с TripTrek",
  about: "Что где лежит: вкладки, кнопка «+», приглашение друзей",
  group: "start",
  steps: [
    {
      id: "w-welcome",
      art: "welcome",
      roles: ["owner"],
      title: "Добро пожаловать в TripTrek!",
      text: "Маршрут, бюджет, карта и воспоминания поездки — в одном месте, вместе с друзьями. Покажем главное за минуту.",
    },
    {
      id: "w-welcome-member",
      art: "welcome",
      roles: ["member"],
      title: "Вы в общей поездке",
      text: "Здесь всё общее: маршрут, траты, фото и чат. Что добавит один — сразу увидят все. Покажем, где что лежит.",
    },
    {
      id: "w-welcome-viewer",
      art: "welcome",
      roles: ["viewer"],
      title: "Вы смотрите поездку",
      text: "У вас доступ для чтения: маршрут, карта, фото, траты и чат открыты, а править их может только компания поездки.",
    },
    {
      id: "w-tabs",
      title: "Всё — по вкладкам",
      text: "Вкладки идут группами: планирование, воспоминания, в дороге и вместе. Лента листается вбок — на телефоне свайпом.",
      scene: {
        blocks: [
          {
            k: "tabs",
            id: "t",
            items: ["Обзор", "Маршрут", "Карта", "Бюджет", "Лента", "Галерея"],
            on: 0,
            groups: [4],
          },
          { k: "row", icon: "🧭", text: "Поездка · День 3 из 12", sub: "Сводка, следующая точка, бюджет" },
          { k: "meter", text: "Мест посещено", value: 0.4, right: "3/8" },
        ],
        tap: "t2",
        thenMode: "replace",
        then: [
          {
            k: "tabs",
            id: "u",
            items: ["Обзор", "Маршрут", "Карта", "Бюджет", "Лента", "Галерея"],
            on: 2,
            groups: [4],
          },
          { k: "map", pins: [{ x: 0.2, y: 0.7, done: true, tone: "green" }, { x: 0.5, y: 0.35 }, { x: 0.8, y: 0.6 }], route: true },
        ],
      },
    },
    {
      id: "w-quickadd",
      roles: EDITORS,
      title: "Кнопка «+» — быстрое добавление",
      text: "Трата, фото или заметка — в пару касаний из любого раздела. Фото грузятся в фоне: окно можно закрыть, снимки доедут сами.",
      labels: ["Фото", "Трата", "Заметка"],
      scene: {
        blocks: [
          { k: "row", icon: "🗺️", text: "Ваш экран", sub: "Любой раздел" },
          { k: "fab", id: "fab" },
        ],
        tap: "fab",
        thenMode: "replace",
        then: [
          { k: "title", text: "Быстрое добавление" },
          { k: "chips", items: [{ text: "Фото", on: true }, { text: "Трата" }, { text: "Заметка" }] },
          { k: "btn", text: "Из галереи", ghost: true },
          { k: "meter", text: "Загружается в фоне", value: 0.6, right: "3 из 5", tone: "green" },
        ],
      },
    },
    {
      id: "w-invite",
      roles: EDITORS,
      title: "Планируйте вместе",
      text: "Позовите друзей кодом, ссылкой или QR — все изменения видны каждому сразу. Кнопка «Позвать друзей» — на «Обзоре».",
      labels: ["Позвать друзей"],
      scene: {
        blocks: [
          { k: "people", items: ["🧭", "📷"] },
          { k: "btn", text: "Позвать друзей", id: "inv" },
        ],
        tap: "inv",
        thenMode: "replace",
        then: [{ k: "people", items: ["🧭", "📷", "🧗"] }, { k: "code", text: "Код · Ссылка · QR" }, { k: "note", text: "Друг ввёл код — поездка уже у него", tone: "green" }],
      },
    },
    {
      id: "w-done",
      art: "done",
      roles: EDITORS,
      title: "Готово!",
      text: "На «Обзоре» ждёт список «Первые шаги». Подсказки раздела — кнопка «?» в шапке (на телефоне: «Ещё»). Все обучения — в Профиле.",
      cta: "Всё ясно",
      labels: ["Первые шаги"],
    },
    {
      id: "w-done-viewer",
      art: "done",
      roles: ["viewer"],
      title: "Готово!",
      text: "Подсказки раздела — кнопка «?» в шапке (на телефоне: «Ещё»). Все обучения — в Профиле.",
      cta: "Всё ясно",
    },
  ],
};

// === Туры вкладок ===

const DASHBOARD: TourDef = {
  id: "dashboard",
  kind: "tab",
  tab: "dashboard",
  title: "Обзор",
  about: "Сводка, первые шаги, друзья, управление составом",
  group: "plan",
  steps: [
    {
      id: "dash-summary",
      title: "Всё главное — здесь",
      text: "Сводка поездки: текущий день, прогресс по местам, бюджет и следующая точка маршрута.",
      scene: {
        blocks: [
          { k: "title", text: "День 3 из 12", right: "Киото" },
          { k: "meter", text: "Мест посещено", value: 0.375, right: "3/8" },
          { k: "stats", items: [{ label: "Потрачено", value: "$240" }, { label: "Осталось", value: "$560", tone: "green" }] },
        ],
      },
    },
    {
      id: "dash-steps",
      roles: EDITORS,
      title: "Первые шаги",
      text: "Список под сводкой ведёт по основам и сам отмечает сделанное: место, друг, трата, фото. Каждый пункт — кнопка, которая сразу ведёт к делу.",
      labels: ["Первые шаги"],
      scene: {
        blocks: [
          { k: "title", text: "Первые шаги", right: "1 из 5" },
          { k: "row", text: "Создать поездку", done: true },
          { k: "row", text: "Добавить первое место", id: "step" },
          { k: "row", text: "Позвать друга" },
        ],
        tap: "step",
        then: [{ k: "note", text: "Место добавлено — пункт отмечен сам ✓", tone: "green" }],
      },
    },
    {
      id: "dash-invite",
      roles: EDITORS,
      title: "Позовите друзей",
      text: "«Позвать друзей» даёт код, ссылку и QR. Друг вводит код при входе — и поездка появляется у него в списке. Состав — в «О поездке».",
      labels: ["Позвать друзей"],
      action: { label: "Позвать друзей", do: "invite" },
      scene: {
        blocks: [{ k: "btn", text: "Позвать друзей", id: "inv" }, { k: "people", items: ["🧭", "📷"] }],
        tap: "inv",
        then: [{ k: "code", text: "Код · Ссылка · QR" }],
      },
    },
    {
      id: "dash-owner",
      roles: ["owner"],
      title: "Владелец держит порядок",
      text: "Владелец может исключить или заблокировать участника, а также передать владение — кнопки у каждого в списке состава.",
      labels: ["Исключить", "Заблокировать", "Передать владение"],
      scene: {
        blocks: [{ k: "row", icon: "📷", text: "Макс", badge: "участник", id: "member" }],
        tap: "member",
        then: [
          { k: "btn", text: "Передать владение", ghost: true },
          { k: "btn", text: "Исключить", tone: "amber", ghost: true },
          { k: "btn", text: "Заблокировать", tone: "red", ghost: true },
        ],
      },
    },
  ],
};

const TIMELINE: TourDef = {
  id: "timeline",
  kind: "tab",
  tab: "timeline",
  title: "Лента",
  about: "Хроника поездки: места, фото, траты, записи",
  group: "memories",
  steps: [
    {
      id: "tl-what",
      title: "Хроника поездки",
      text: "Лента собирает всё, что произошло: посещённые места, фото, траты, записи дневника и новых участников.",
      scene: {
        blocks: [
          { k: "row", icon: "📍", text: "Посетили Храм Неба", sub: "День 2" },
          { k: "row", icon: "📸", text: "5 новых фото", sub: "День 2" },
          { k: "row", icon: "💸", text: "Обед · $12", sub: "День 2" },
          { k: "row", icon: "📔", text: "Запись дня", sub: "День 2" },
        ],
      },
    },
    {
      id: "tl-jump",
      title: "Фильтры и переходы",
      text: "Пилюли сверху оставят только нужные события, а тап по событию откроет его раздел — маршрут, галерею или бюджет.",
      scene: {
        blocks: [
          { k: "chips", items: [{ text: "Все" }, { text: "Фото", on: true }, { text: "Траты" }, { text: "Дневник" }] },
          { k: "row", icon: "📸", text: "5 новых фото", sub: "День 2", id: "ev" },
        ],
        tap: "ev",
        thenMode: "replace",
        then: [{ k: "title", text: "Галерея" }, { k: "photos", count: 6 }],
      },
    },
  ],
};

const ITINERARY: TourDef = {
  id: "itinerary",
  kind: "tab",
  tab: "itinerary",
  title: "Маршрут",
  about: "Дни, места по слотам, точка на карте, ИИ-подбор, публичная ссылка",
  group: "plan",
  steps: [
    {
      id: "it-days",
      roles: EDITORS,
      title: "Дни маршрута",
      text: "День — это город. «Добавить день» берёт следующий номер, дата подставится сама: день №N = дата старта + N−1.",
      labels: ["Добавить день"],
      scene: {
        blocks: [{ k: "row", icon: "📅", text: "День 3 · Токио" }, { k: "btn", text: "Добавить день", id: "add" }],
        tap: "add",
        then: [{ k: "row", icon: "📅", text: "День 4 · Киото", sub: "дата подставилась сама", tone: "green" }],
      },
    },
    {
      id: "it-places",
      roles: EDITORS,
      title: "Места по слотам времени",
      text: "В карточке дня «Добавить место»: выберите Утро, День или Вечер — порядок дня построится сам.",
      labels: ["Добавить место"],
      scene: {
        blocks: [{ k: "row", icon: "📅", text: "День 4 · Киото" }, { k: "btn", text: "Добавить место", id: "add" }],
        tap: "add",
        then: [
          { k: "chips", items: [{ text: "Утро", on: true }, { text: "День" }, { text: "Вечер" }] },
          { k: "field", text: "Название места" },
        ],
      },
    },
    {
      id: "it-map",
      roles: EDITORS,
      title: "Точка прямо на карте",
      text: "В форме места нажмите «Выбрать на карте»: перетащите карту — адрес подставится автоматически.",
      labels: ["Выбрать на карте"],
      scene: {
        blocks: [{ k: "field", text: "Название места" }, { k: "btn", text: "Выбрать на карте", ghost: true, id: "pick" }],
        tap: "pick",
        thenMode: "replace",
        then: [{ k: "map", pins: [{ x: 0.5, y: 0.5, tone: "primary" }] }, { k: "field", text: "Адрес подставился сам" }],
      },
    },
    {
      id: "it-card",
      title: "Карточка места",
      text: "Тап по месту: отметить посещённым, построить маршрут до него, прикрепить фото и заметки.",
      scene: {
        blocks: [{ k: "row", icon: "⛩️", text: "Фусими Инари", sub: "Утро", id: "place" }],
        tap: "place",
        then: [{ k: "btn", text: "Посещено 🎉", tone: "green" }, { k: "btn", text: "Маршрут", ghost: true }],
      },
    },
    {
      id: "it-planner",
      roles: EDITORS,
      title: "ИИ подберёт места",
      text: "«Подобрать места с ИИ» даёт варианты, а не готовый маршрут: добавьте в день хотя бы одно место или отель — ИИ предложит остальное рядом. Названия проверяйте. ИИ работает на вашем ключе: он подключается в Профиле.",
      labels: ["Подобрать места с ИИ"],
      action: { label: "Подключить ключ ИИ", do: "profile-ai" },
      scene: {
        blocks: [{ k: "btn", text: "Подобрать места с ИИ", id: "ai" }],
        tap: "ai",
        then: [
          { k: "row", icon: "✨", text: "Чайный домик", sub: "рядом с отелем" },
          { k: "row", icon: "✨", text: "Бамбуковая роща", sub: "10 мин пешком" },
          { k: "note", text: "Вы решаете, что добавить", tone: "amber" },
        ],
      },
    },
    {
      id: "it-share",
      roles: ["owner"],
      title: "Поделиться маршрутом",
      text: "«Поделиться» создаёт публичную ссылку: друзья и родные смотрят маршрут, фото и карту без регистрации. Срок ссылки и доступ настраиваются в «О поездке».",
      labels: ["Поделиться"],
      scene: {
        blocks: [{ k: "btn", text: "Поделиться", id: "share" }],
        tap: "share",
        then: [{ k: "code", text: "triptrek / p / ссылка" }, { k: "note", text: "Гости смотрят без входа", tone: "green" }],
      },
    },
  ],
};

const LODGING: TourDef = {
  id: "lodging",
  kind: "tab",
  tab: "lodging",
  title: "Жильё",
  about: "Брони, «ночуем здесь», адрес для таксиста",
  group: "plan",
  steps: [
    {
      id: "lg-add",
      roles: EDITORS,
      title: "Где ночуем",
      text: "«Добавить жильё»: название, адрес «как в брони» (лучше на местном языке), даты заезда и выезда, номер брони.",
      labels: ["Добавить жильё"],
      scene: {
        blocks: [{ k: "btn", text: "+ Добавить жильё", id: "add" }],
        tap: "add",
        then: [
          { k: "field", text: "Название · Отель Сакура" },
          { k: "field", text: "Адрес как в брони" },
          { k: "chips", items: [{ text: "Заезд 12.05", on: true }, { text: "Выезд 15.05", on: true }] },
        ],
      },
    },
    {
      id: "lg-tonight",
      title: "Сегодня ночуем здесь",
      text: "В дни проживания вверху появляется карточка «Сегодня ночуем здесь» с адресом и кнопками «Маршрут» и «Позвонить».",
      labels: ["Сегодня ночуем здесь", "Маршрут", "Позвонить"],
      scene: {
        blocks: [
          { k: "title", text: "🌙 Сегодня ночуем здесь" },
          { k: "row", icon: "🏨", text: "Отель Сакура", sub: "ещё 2 ночи" },
          { k: "btn", text: "Маршрут", ghost: true },
        ],
      },
    },
    {
      id: "lg-taxi",
      title: "Показать таксисту",
      text: "«Показать таксисту» выводит адрес крупно, на местном языке: водителю не нужно ничего объяснять.",
      labels: ["Показать таксисту", "Отвезите меня сюда"],
      scene: {
        blocks: [{ k: "row", icon: "🏨", text: "Отель Сакура" }, { k: "btn", text: "🚕 Показать таксисту", id: "taxi" }],
        tap: "taxi",
        thenMode: "replace",
        then: [{ k: "title", text: "🚕 Отвезите меня сюда" }, { k: "note", text: "さくらホテル · 京都市下京区", tone: "primary" }],
      },
    },
  ],
};

const MAP: TourDef = {
  id: "map",
  kind: "tab",
  tab: "map",
  title: "Карта",
  about: "Метки и линии дней, фильтры, добавление с карты",
  group: "plan",
  steps: [
    {
      id: "mp-markers",
      title: "Все места — на карте",
      text: "Маркеры с адресами: серые — запланировано, зелёные — посещено. Тап по маркеру откроет карточку места.",
      scene: {
        blocks: [
          { k: "map", pins: [{ x: 0.2, y: 0.65, done: true, tone: "green" }, { x: 0.45, y: 0.4, done: true, tone: "green", }, { x: 0.7, y: 0.6 }, { x: 0.85, y: 0.3 }], id: "m" },
          { k: "chips", items: [{ text: "● Запланировано" }, { text: "● Посещено", on: true }] },
        ],
        tap: "m",
        then: [{ k: "row", icon: "⛩️", text: "Фусими Инари", sub: "Посещено" }],
      },
    },
    {
      id: "mp-lines",
      title: "Цветные линии",
      text: "Нити соединяют места одного дня по порядку, цвет = цвет дня. Сплошная — пройдено, пунктир — ещё впереди.",
      scene: {
        blocks: [{ k: "map", pins: [{ x: 0.15, y: 0.7, done: true, tone: "green" }, { x: 0.4, y: 0.35, done: true, tone: "green" }, { x: 0.65, y: 0.6 }, { x: 0.85, y: 0.25 }], route: true }],
      },
    },
    {
      id: "mp-filters",
      title: "Фильтры и стиль",
      text: "Города, только непосещённые, кафе и бары, фото на карте. Стиль карты: классика, спутник или тёмная.",
      scene: {
        blocks: [
          { k: "chips", items: [{ text: "Только непосещённые", on: true }, { text: "Кафе и бары" }, { text: "Фото" }], id: "f" },
          { k: "map", pins: [{ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.4 }] },
        ],
      },
    },
    {
      id: "mp-add",
      roles: EDITORS,
      title: "Добавить прямо с карты",
      text: "Кнопка «+» включает прицел: перетащите карту под точку — и добавьте место с готовым адресом.",
      labels: ["Добавить здесь"],
      scene: {
        blocks: [{ k: "map", pins: [{ x: 0.3, y: 0.55 }] }, { k: "fab", id: "fab" }],
        tap: "fab",
        then: [{ k: "btn", text: "Добавить здесь", tone: "primary" }],
      },
    },
  ],
};

const GALLERY: TourDef = {
  id: "gallery",
  kind: "tab",
  tab: "gallery",
  title: "Галерея",
  about: "Фото в фоне, лучшие кадры, публичная ссылка",
  group: "memories",
  steps: [
    {
      id: "gl-add",
      roles: EDITORS,
      title: "Фото — в пару касаний",
      text: "«Добавить фото» (или «+» → «Фото»): выберите снимки «Из галереи» или «Снять фото». Загрузка идёт в фоне — окно можно закрыть, снимки доедут сами.",
      labels: ["Добавить фото", "Из галереи", "Снять фото"],
      action: { label: "Добавить фото", do: "quickadd:photo" },
      scene: {
        blocks: [{ k: "btn", text: "Добавить фото", id: "add" }],
        tap: "add",
        then: [{ k: "photos", count: 4 }, { k: "meter", text: "Загружается в фоне", value: 0.65, right: "5 из 8", tone: "green" }],
      },
    },
    {
      id: "gl-map",
      title: "Фото попадают на карту",
      text: "Если у снимка есть геометка, он встанет на «Карту» меткой — включите там фильтр фото. Без геометки фото просто лежит в альбоме.",
      scene: {
        blocks: [{ k: "photos", count: 3 }, { k: "map", pins: [{ x: 0.3, y: 0.5, tone: "sky" }, { x: 0.7, y: 0.35, tone: "sky" }] }],
      },
    },
    {
      id: "gl-fav",
      title: "Лучшие кадры",
      text: "Откройте фото и нажмите ☆ — избранные соберутся в «Только избранное». Владелец может скрыть кадр от гостей публичной ссылки.",
      labels: ["Только избранное", "Скрыто от гостей"],
      scene: {
        blocks: [
          { k: "chips", items: [{ text: "Все" }, { text: "☆ Только избранное", on: true }] },
          { k: "photos", count: 3, id: "ph" },
        ],
        tap: "ph",
        then: [{ k: "note", text: "☆ в избранном", tone: "amber" }],
      },
    },
    {
      id: "gl-share",
      roles: ["owner"],
      title: "Поделиться альбомом",
      text: "«Поделиться» открывает публичную страницу: гости смотрят фото, слайдшоу и карту по дням без регистрации. Ссылку можно ограничить по сроку и сменить.",
      labels: ["Поделиться", "Срок действия ссылки"],
      scene: {
        blocks: [{ k: "btn", text: "Поделиться", id: "share" }],
        tap: "share",
        then: [{ k: "code", text: "Публичная страница" }, { k: "chips", items: [{ text: "7 дней", on: true }, { text: "30 дней" }, { text: "Без срока" }] }],
      },
    },
  ],
};

const BUDGET: TourDef = {
  id: "budget",
  kind: "tab",
  tab: "budget",
  title: "Бюджет",
  about: "Траты, долги между друзьями, возвраты",
  group: "plan",
  steps: [
    {
      id: "bg-personal",
      roles: EDITORS,
      title: "Бюджет каждого",
      text: "«Настроить» в блоке «Бюджет каждого» задаёт личный лимит участника. Общий бюджет — сумма личных.",
      labels: ["Бюджет каждого", "Настроить"],
      scene: {
        blocks: [{ k: "title", text: "Бюджет каждого" }, { k: "meter", text: "Аня", value: 0.5, right: "$500" }, { k: "btn", text: "Настроить", ghost: true }],
      },
    },
    {
      id: "bg-add",
      roles: EDITORS,
      title: "Траты — и итоги сразу",
      text: "«Добавить трату»: сумма в любой валюте, кто заплатил и за кого. Балансы пересчитываются мгновенно.",
      labels: ["Добавить трату"],
      action: { label: "Добавить трату", do: "quickadd:expense" },
      scene: {
        blocks: [{ k: "btn", text: "Добавить трату", id: "add" }],
        tap: "add",
        then: [{ k: "field", text: "Сумма · 3 600 ¥" }, { k: "chips", items: [{ text: "Заплатил: Аня", on: true }, { text: "За: все" }] }],
      },
    },
    {
      id: "bg-debts",
      title: "Долги посчитаются сами",
      text: "Плата «за других» разложится на долги: блок «Расчёт между друзьями» покажет, кто кому сколько должен.",
      labels: ["Расчёт между друзьями"],
      scene: {
        blocks: [{ k: "title", text: "Расчёт между друзьями" }, { k: "row", icon: "💸", text: "Макс → Аня", badge: "$12", tone: "amber" }, { k: "row", icon: "💸", text: "Лена → Аня", badge: "$7", tone: "amber" }],
      },
    },
    {
      id: "bg-settle",
      roles: EDITORS,
      title: "Вернули — отметьте",
      text: "Кнопка «Перевели» подтверждает возврат: долг гаснет, а перевод остаётся в истории трат.",
      labels: ["Перевели"],
      scene: {
        blocks: [{ k: "row", icon: "💸", text: "Макс → Аня", badge: "$12", tone: "amber" }, { k: "btn", text: "Перевели", id: "paid" }],
        tap: "paid",
        thenMode: "replace",
        then: [{ k: "note", text: "Долгов нет 🎉", tone: "green" }, { k: "row", icon: "✓", text: "Перевод в истории", done: true }],
      },
    },
    {
      id: "bg-split",
      title: "А повседневные траты?",
      text: "Квартира, продукты, кафе с друзьями — не в поездке. Для этого есть отдельный раздел «Сочтёмся»: меню «Ещё» → «Сочтёмся — общие траты».",
      action: { label: "Открыть «Сочтёмся»", do: "split" },
      scene: {
        blocks: [{ k: "row", icon: "🏠", text: "Квартира", sub: "3 человека", badge: "−$25", tone: "red" }, { k: "row", icon: "🍕", text: "Пятничный ужин", badge: "+$18", tone: "green" }],
      },
    },
  ],
};

const REST: TourDef = {
  id: "rest",
  kind: "tab",
  tab: "rest",
  title: "Chill",
  about: "Кафе и бары: из плана, список желаний, рядом",
  group: "road",
  steps: [
    {
      id: "ch-sections",
      title: "Три раздела",
      text: "«Маршрут» — кафе и бары из плана, «Хочу» — ваш список желаний, «Рядом» — что есть поблизости.",
      labels: ["Маршрут", "Рядом"],
      scene: {
        blocks: [{ k: "chips", items: [{ text: "Маршрут", on: true }, { text: "Хочу" }, { text: "Рядом" }], id: "c" }, { k: "row", icon: "☕", text: "Кофейня на углу", sub: "День 2 · вечер" }],
      },
    },
    {
      id: "ch-nearby",
      title: "«Рядом»",
      text: "Кафе, бары и рестораны вокруг вас — данные OpenStreetMap, радиус 500 м–3 км настраивается. ИИ соберёт прогулку на пару часов или подборку ресторанов у города дня.",
      scene: {
        blocks: [{ k: "chips", items: [{ text: "500 м" }, { text: "1 км", on: true }, { text: "3 км" }] }, { k: "row", icon: "☕", text: "Кофе Маэда", sub: "300 м" }, { k: "row", icon: "🍜", text: "Рамен Ичиран", sub: "650 м" }],
      },
    },
    {
      id: "ch-wish",
      title: "«Хочу посетить»",
      text: "Понравилось место из «Рядома»? «Хочу посетить» добавит его в личный вишлист — он виден только вам.",
      labels: ["Хочу посетить"],
      scene: {
        blocks: [{ k: "row", icon: "🍜", text: "Рамен Ичиран", sub: "650 м" }, { k: "btn", text: "⭐ Хочу посетить", id: "wish" }],
        tap: "wish",
        then: [{ k: "note", text: "Добавлено в личный список ⭐", tone: "amber" }],
      },
    },
  ],
};

const JOURNAL: TourDef = {
  id: "journal",
  kind: "tab",
  tab: "journal",
  title: "Дневник",
  about: "Запись на каждый день, пульс настроения",
  group: "memories",
  steps: [
    {
      id: "jr-write",
      roles: EDITORS,
      title: "Одна строчка в день",
      text: "«Новая запись»: выберите день, настроение и напишите пару строк. Записи привязаны к дням поездки — так дневник складывается в историю.",
      labels: ["Новая запись", "Настроение"],
      action: { label: "Написать запись", do: "quickadd:journal" },
      scene: {
        blocks: [{ k: "btn", text: "Новая запись", id: "new" }],
        tap: "new",
        then: [{ k: "chips", items: [{ text: "День 3", on: true }, { text: "😊", on: true }, { text: "😴" }] }, { k: "field", text: "Что запомнилось сегодня…" }],
      },
    },
    {
      id: "jr-mood",
      title: "Пульс настроения",
      text: "Настроения записей складываются в ленту сверху. Тап по настроению оставит только такие записи.",
      labels: ["Пульс настроения"],
      scene: {
        blocks: [{ k: "chips", items: [{ text: "😊 4", on: true }, { text: "😐 2" }, { text: "😴 1" }], id: "mood" }, { k: "row", icon: "📔", text: "День 3 · Фусими Инари", sub: "😊" }],
      },
    },
    {
      id: "jr-ai",
      title: "Из записей — в рассказ",
      text: "Дневник, места и траты — материал для рассказа о поездке на вкладке AI.",
      action: { label: "Открыть AI", do: "tab:ai" },
      scene: { blocks: [{ k: "row", icon: "📔", text: "7 записей" }, { k: "row", icon: "✨", text: "История поездки", sub: "готова за минуту", tone: "violet" }] },
    },
  ],
};

const AI: TourDef = {
  id: "ai",
  kind: "tab",
  tab: "ai",
  title: "AI",
  about: "Рассказ о поездке, ключ ИИ, где ещё работает ИИ",
  group: "road",
  steps: [
    {
      id: "ai-key",
      title: "ИИ работает на вашем ключе",
      text: "Общего ключа нет: подключите свой в «Профиль → Ключ ИИ». Зарегистрируйтесь у провайдера ИИ, пополните баланс на пару долларов и создайте ключ — строку вида «sk-…».",
      labels: ["Подключите свой ключ ИИ"],
      action: { label: "Открыть Профиль", do: "profile-ai" },
      scene: {
        blocks: [{ k: "title", text: "Профиль", right: "Ключ ИИ" }, { k: "field", text: "sk-••••••••b7Fk", id: "key" }],
        tap: "key",
        then: [{ k: "note", text: "Свой ключ подключён ✓", tone: "green" }],
      },
    },
    {
      id: "ai-story",
      title: "Рассказ о поездке",
      text: "Выберите день, формат и стиль — и «Написать историю». Обычно 20–90 секунд, страницу не закрывайте. Без ключа вы получите лишь черновик по данным поездки.",
      labels: ["Написать историю", "Стиль рассказа", "Что рассказать"],
      scene: {
        blocks: [{ k: "chips", items: [{ text: "Вся поездка", on: true }, { text: "Один день" }] }, { k: "btn", text: "Написать историю", id: "go" }],
        tap: "go",
        then: [{ k: "meter", text: "Пишем…", value: 0.6, tone: "violet" }],
      },
    },
    {
      id: "ai-where",
      title: "Где ещё есть ИИ",
      text: "«Подобрать места с ИИ» на Маршруте, прогулки и подборки в Chill, наборы фраз и «Подборка шефа» в Еде. Везде — ваш ключ; ИИ может ошибаться, проверяйте названия.",
      labels: ["Подобрать места с ИИ", "Подборка шефа"],
      scene: {
        blocks: [{ k: "row", icon: "🗺️", text: "Маршрут", sub: "подбор мест" }, { k: "row", icon: "☕", text: "Chill", sub: "прогулки и подборки" }, { k: "row", icon: "🍜", text: "Еда", sub: "подборка шефа" }],
      },
    },
  ],
};

const FOOD: TourDef = {
  id: "food",
  kind: "tab",
  tab: "food",
  title: "Еда",
  about: "Меню поездки: что попробовать, оценки, подборка шефа",
  group: "road",
  steps: [
    {
      id: "fd-menu",
      roles: EDITORS,
      title: "Меню поездки",
      text: "«Добавить блюдо»: название, город, где искать и цена. Фото, чек-лист и оценки помогут вспомнить лучшее.",
      labels: ["Добавить блюдо"],
      scene: {
        blocks: [{ k: "btn", text: "Добавить блюдо", id: "add" }],
        tap: "add",
        then: [{ k: "field", text: "Название · Рамен" }, { k: "chips", items: [{ text: "Токио", on: true }, { text: "Киото" }] }],
      },
    },
    {
      id: "fd-tried",
      title: "Попробовали!",
      text: "В карточке блюда отметьте «✓ Попробовали», поставьте оценку вкуса и приложите фото. «Попробовали» — общее для всей компании.",
      labels: ["✓ Попробовали", "Оценка вкуса"],
      scene: {
        blocks: [{ k: "row", icon: "🍜", text: "Рамен", sub: "Токио", id: "dish" }],
        tap: "dish",
        then: [{ k: "chips", items: [{ text: "⏳ Попробовать" }, { text: "✓ Попробовали", on: true }] }, { k: "row", icon: "⭐", text: "Оценка вкуса", badge: "9/10", tone: "amber" }],
      },
    },
    {
      id: "fd-chef",
      roles: EDITORS,
      title: "Подборка шефа",
      text: "ИИ предложит знаковые блюда города — от уличной еды до ресторанных специалитетов. Это ориентир, не гарантия: точные названия ищите на месте.",
      labels: ["Подборка шефа"],
      scene: {
        blocks: [{ k: "btn", text: "✨ Подборка шефа", id: "chef" }],
        tap: "chef",
        then: [{ k: "row", icon: "🍢", text: "Якитори" }, { k: "row", icon: "🍣", text: "Нигири" }, { k: "note", text: "Ориентир, а не гарантия", tone: "amber" }],
      },
    },
  ],
};

const PHRASES: TourDef = {
  id: "phrases",
  kind: "tab",
  tab: "phrases",
  title: "Фразы",
  about: "Разговорник: наборы, ИИ, голос",
  group: "road",
  steps: [
    {
      id: "ph-pack",
      title: "Язык — целым набором",
      text: "«Загрузить набор» добавит пачку готовых фраз для 9 языков сразу: основы, еда, транспорт, экстренные.",
      labels: ["Загрузить набор"],
      scene: {
        blocks: [{ k: "btn", text: "Загрузить набор", id: "pack" }],
        tap: "pack",
        then: [{ k: "chips", items: [{ text: "🇯🇵 Японский", on: true }, { text: "🇨🇳 Китайский" }, { text: "🇰🇷 Корейский" }] }],
      },
    },
    {
      id: "ph-ai",
      title: "Любой язык через ИИ",
      text: "Страны нет в списке? ИИ соберёт набор почти для любого языка (нужен ваш ключ) — интернет нужен один раз, дальше офлайн.",
      labels: ["Собрать"],
      action: { label: "Подключить ключ ИИ", do: "profile-ai" },
      scene: {
        blocks: [{ k: "field", text: "Например: грузинский" }, { k: "btn", text: "✨ Собрать", id: "go" }],
        tap: "go",
        then: [{ k: "note", text: "~24 фразы, потом — офлайн", tone: "violet" }],
      },
    },
    {
      id: "ph-card",
      title: "Карточка на весь экран",
      text: "Тап по фразе — крупно на весь экран: свайп листает, есть медленная озвучка и копирование.",
      labels: ["Копировать"],
      scene: {
        blocks: [{ k: "row", icon: "🗣️", text: "Спасибо", sub: "ありがとう", id: "phrase" }],
        tap: "phrase",
        thenMode: "replace",
        then: [{ k: "title", text: "ありがとう" }, { k: "btn", text: "Медленно 🐢", ghost: true }, { k: "btn", text: "Копировать", ghost: true }],
      },
    },
    {
      id: "ph-tts",
      title: "Голос телефона",
      text: "Озвучка — системный голос телефона. Если молчит: скачайте язык страны в настройках речи (TTS) телефона.",
      scene: { blocks: [{ k: "row", icon: "🔊", text: "Озвучка", sub: "системный голос" }, { k: "note", text: "Молчит? Скачайте язык в настройках речи", tone: "amber" }] },
    },
  ],
};

const WEATHER: TourDef = {
  id: "weather",
  kind: "tab",
  tab: "weather",
  title: "Погода",
  about: "Прогноз по дням маршрута, что взять с собой",
  group: "road",
  steps: [
    {
      id: "wt-days",
      title: "Погода по дням поездки",
      text: "Прогноз города, запланированного на день. Нажмите на день, чтобы открыть его город; вкладка «7 дней» покажет ближайшую неделю.",
      labels: ["По маршруту", "7 дней"],
      scene: {
        blocks: [{ k: "chips", items: [{ text: "По маршруту", on: true }, { text: "7 дней" }] }, { k: "row", icon: "☀️", text: "День 3 · Киото", badge: "21°" }, { k: "row", icon: "🌧️", text: "День 4 · Осака", badge: "16°" }],
      },
    },
    {
      id: "wt-pack",
      title: "Что взять с собой",
      text: "По прогнозу приложение подскажет, что положить в чемодан: зонт, куртка или крем от солнца.",
      labels: ["Что взять с собой"],
      scene: { blocks: [{ k: "title", text: "Что взять с собой" }, { k: "row", icon: "☂️", text: "Зонт", sub: "дожди на 4-й день" }, { k: "row", icon: "🧥", text: "Лёгкая куртка", sub: "вечером 14°" }] },
    },
  ],
};

const BOARD: TourDef = {
  id: "board",
  kind: "tab",
  tab: "board",
  title: "Чат",
  about: "Общий чат поездки, ответы, поиск",
  group: "together",
  steps: [
    {
      id: "bd-chat",
      title: "Общий чат поездки",
      text: "Пишите всей компании: Enter отправляет, Shift+Enter — новая строка. На сообщение можно «Ответить», поставить реакцию или «Изменить» своё.",
      labels: ["Ответить", "Изменить"],
      scene: {
        blocks: [{ k: "msg", text: "Встречаемся у вокзала в 9?" }, { k: "msg", text: "Да, я уже еду 👍", me: true, id: "me" }],
        tap: "me",
        then: [{ k: "btn", text: "Ответить", ghost: true }, { k: "btn", text: "Изменить", ghost: true }],
      },
    },
    {
      id: "bd-search",
      title: "Поиск по чату",
      text: "Лупа («Найти в чате…») ищет по переписке. Важное сообщение можно закрепить — оно останется наверху.",
      labels: ["Найти в чате…"],
      scene: { blocks: [{ k: "field", text: "Найти в чате…" }, { k: "msg", text: "Билеты на поезд: вагон 5" }] },
    },
  ],
};

const ACHIEVEMENTS: TourDef = {
  id: "achievements",
  kind: "tab",
  tab: "achievements",
  title: "Награды",
  about: "Общие достижения поездки",
  group: "memories",
  steps: [
    {
      id: "ac-what",
      title: "Награды поездки",
      text: "Награды выдаются за места, фото, траты и записи. Награда общая — закроется для всей компании, а полоска покажет путь до следующей.",
      labels: ["Награда общая — закроется для всей компании"],
      scene: { blocks: [{ k: "row", icon: "🏆", text: "Первое место", badge: "получено", tone: "green" }, { k: "meter", text: "До следующей награды", value: 0.7, tone: "amber" }] },
    },
    {
      id: "ac-share",
      title: "Похвастаться",
      text: "«Похвастаться коллекцией» делится картинкой с наградами — в чат или соцсети.",
      labels: ["Похвастаться коллекцией"],
      scene: { blocks: [{ k: "btn", text: "Похвастаться коллекцией", id: "brag" }], tap: "brag", then: [{ k: "photos", count: 3 }] },
    },
  ],
};

const INFO: TourDef = {
  id: "info",
  kind: "tab",
  tab: "info",
  title: "Инфо",
  about: "Чек-лист «Подготовка к поездке» и справка",
  group: "together",
  steps: [
    {
      id: "in-checklist",
      title: "Чек-лист и справка",
      text: "Чек-лист «Подготовка к поездке» и справка с контактами, транспортом и советами — всё под рукой, в том числе офлайн.",
      labels: ["Подготовка к поездке", "Справка поездки"],
      scene: { blocks: [{ k: "title", text: "Подготовка к поездке", right: "2/5" }, { k: "row", text: "Паспорт", done: true }, { k: "row", text: "Страховка" }, { k: "row", text: "Зарядка" }] },
    },
    {
      id: "in-templates",
      roles: EDITORS,
      title: "Начните с шаблона",
      text: "«Шаблоны» добавят готовые пункты чек-листа одним махом — отметьте нужное и сохраните.",
      labels: ["Шаблоны"],
      scene: {
        blocks: [{ k: "btn", text: "Шаблоны", id: "tpl" }],
        tap: "tpl",
        then: [{ k: "row", text: "Документы", done: true }, { k: "row", text: "Аптечка", done: true }, { k: "row", text: "Гаджеты" }],
      },
    },
  ],
};

// === «Сочтёмся» (отдельный раздел /split) ===

const SPLIT_HUB: TourDef = {
  id: "split-hub",
  kind: "split",
  splitScreen: "hub",
  title: "«Сочтёмся»: начало",
  about: "Что это и как создать первую группу",
  group: "split",
  steps: [
    {
      id: "sp-what",
      title: "Общие траты без споров",
      text: "Квартира, продукты, кафе, интернет — записывайте, кто заплатил и на кого делить. «Сочтёмся» покажет, кто кому должен.",
      scene: {
        blocks: [{ k: "stats", items: [{ label: "Тебе должны", value: "$32", tone: "green" }, { label: "Ты должен(на)", value: "$11", tone: "red" }] }, { k: "row", icon: "🏠", text: "Квартира", badge: "+$20", tone: "green" }],
      },
    },
    {
      id: "sp-create",
      title: "Создайте группу",
      text: "«Создать группу»: название (Квартира, Мы вдвоём…) и валюта. Друзей зовёте кодом или ссылкой; если вас уже зовут — «У меня есть код».",
      labels: ["Создать группу", "У меня есть код"],
      scene: {
        blocks: [{ k: "btn", text: "Создать группу", id: "new" }, { k: "btn", text: "У меня есть код", ghost: true }],
        tap: "new",
        thenMode: "replace",
        then: [{ k: "title", text: "Новая группа" }, { k: "field", text: "Название · Квартира" }, { k: "chips", items: [{ text: "RUB", on: true }, { text: "USD" }, { text: "EUR" }] }],
      },
    },
  ],
};

const SPLIT_GROUP: TourDef = {
  id: "split-group",
  kind: "split",
  splitScreen: "group",
  title: "«Сочтёмся»: группа",
  about: "Траты, баланс, возвраты, итоги",
  group: "split",
  steps: [
    {
      id: "sg-add",
      title: "Добавьте трату",
      text: "«Добавить трату»: сумма, кто заплатил и на кого делить — «Поровну», по «Суммам», «Долям» или в «%».",
      labels: ["Добавить трату", "Поровну", "Доли"],
      scene: {
        blocks: [{ k: "btn", text: "Добавить трату", id: "add" }],
        tap: "add",
        then: [{ k: "field", text: "Сумма · 1 200 ₽" }, { k: "chips", items: [{ text: "Поровну", on: true }, { text: "Суммы" }, { text: "Доли" }, { text: "%" }] }],
      },
    },
    {
      id: "sg-balance",
      title: "Баланс: кто кому",
      text: "Вкладка «Баланс» показывает «Кому сколько перевести» — минимум переводов, чтобы все остались в расчёте. «+» — человеку должны, «−» — он должен.",
      labels: ["Баланс", "Кому сколько перевести"],
      scene: {
        blocks: [{ k: "title", text: "Кому сколько перевести" }, { k: "row", icon: "➡️", text: "Макс → Аня", badge: "480 ₽", tone: "amber" }, { k: "row", icon: "➡️", text: "Лена → Аня", badge: "300 ₽", tone: "amber" }],
      },
    },
    {
      id: "sg-settle",
      title: "Вернули — запишите",
      text: "Тот, кому должны, жмёт «Напомнить» — приходит уведомление. Когда деньги переведены, «Мне отдали» / «Я отдал(а)» гасит долг, он остаётся в журнале. А в «Как вернуть мне деньги» укажите карту — должники её скопируют.",
      labels: ["Напомнить", "Мне отдали", "Как вернуть мне деньги"],
      scene: {
        blocks: [{ k: "row", icon: "➡️", text: "Макс → Аня", badge: "480 ₽", tone: "amber" }, { k: "btn", text: "Напомнить", ghost: true, id: "remind" }, { k: "btn", text: "Мне отдали" }],
        tap: "remind",
        then: [{ k: "note", text: "Макс получил напоминание 🔔", tone: "green" }],
      },
    },
    {
      id: "sg-more",
      title: "Итоги, повторы, журнал",
      text: "«Итоги» — траты месяца по людям и категориям. В «Ещё»: «Повторяющиеся траты» (аренда, подписки — шаблон один раз) и «Журнал» — кто что менял.",
      labels: ["Повторяющиеся траты", "Журнал"],
      scene: {
        blocks: [{ k: "tabs", id: "g", items: ["Траты", "Баланс", "Итоги", "Ещё"], on: 0 }, { k: "row", icon: "🔁", text: "Повторяющиеся траты", sub: "аренда, интернет" }, { k: "row", icon: "📜", text: "Журнал", sub: "кто что менял" }],
      },
    },
  ],
};

export const TOURS: TourDef[] = [
  WELCOME,
  DASHBOARD,
  ITINERARY,
  LODGING,
  MAP,
  BUDGET,
  TIMELINE,
  GALLERY,
  JOURNAL,
  ACHIEVEMENTS,
  FOOD,
  REST,
  WEATHER,
  PHRASES,
  AI,
  BOARD,
  INFO,
  SPLIT_HUB,
  SPLIT_GROUP,
];

export function getTour(id: string): TourDef | undefined {
  return TOURS.find((t) => t.id === id);
}

/** Тур вкладки (для кнопки «?» и автозапуска) */
export function tourForTab(tab: TripTab): TourDef | undefined {
  return TOURS.find((t) => t.kind === "tab" && t.tab === tab);
}

/** Какие туры показывать в Центре обучения (новости — отдельно, в колокольчике: updates-content.ts) */
export function centerTours(): TourDef[] {
  return TOURS;
}
