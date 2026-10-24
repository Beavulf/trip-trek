// Обратная связь: общее ядро без БД и node:* — его читают и API-роуты, и клиент
// (форма, админка). Правила статусов и разбор входа лежат здесь, а не в роутах,
// чтобы их можно было проверить тестами и не размножить по трём местам.

export const FEEDBACK_TYPES = ["bug", "idea", "question", "complaint", "review"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_STATUSES = ["new", "in_progress", "resolved"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export type FeedbackAuthor = "user" | "admin";

export const MAX_MESSAGE = 4000;
export const MAX_GUEST_MESSAGE = 2000;
export const MAX_REPLY = 2000;
/** Реплик в одной переписке: защита от бесконечного треда и раздувания страницы */
export const MAX_THREAD_MESSAGES = 200;

export const FEEDBACK_TYPE_META: Record<
  FeedbackType,
  { emoji: string; label: string; hint: string; placeholder: string }
> = {
  bug: {
    emoji: "🐞",
    label: "Баг",
    hint: "Что-то сломалось или работает не так",
    placeholder: "Что случилось? Что нажимал, что ожидал, что получилось",
  },
  idea: {
    emoji: "💡",
    label: "Идея",
    hint: "Чего не хватает или что можно сделать удобнее",
    placeholder: "Расскажи, чего не хватает и зачем это нужно",
  },
  question: {
    emoji: "❓",
    label: "Вопрос",
    hint: "Что-то непонятно — спроси, ответим",
    placeholder: "Что непонятно? Спрашивай — ответим",
  },
  complaint: {
    emoji: "😠",
    label: "Жалоба",
    hint: "Что-то (или кто-то) не устроило",
    placeholder: "Что не так? Расскажи как есть — мы разберёмся",
  },
  review: {
    emoji: "💬",
    label: "Отзыв",
    hint: "Просто поделиться впечатлением",
    placeholder: "Что нравится, что нет, как пользуешься — всё интересно",
  },
};

/** Статус глазами автора: «Отправлено» понятнее, чем «Новый» */
export const FEEDBACK_STATUS_USER_LABEL: Record<FeedbackStatus, string> = {
  new: "Отправлено",
  in_progress: "В работе",
  resolved: "Закрыто",
};

/** Подписи вкладок главного экрана — зеркало TABS из app-shell (там иконки, здесь только текст) */
const TAB_LABELS: Record<string, string> = {
  dashboard: "Обзор",
  itinerary: "Маршрут",
  lodging: "Жильё",
  map: "Карта",
  budget: "Бюджет",
  timeline: "Лента",
  gallery: "Галерея",
  journal: "Дневник",
  achievements: "Награды",
  food: "Еда",
  rest: "Chill",
  weather: "Погода",
  phrases: "Фразы",
  ai: "AI",
  transport: "Транспорт",
  board: "Чат",
  info: "Инфо",
};

/** Человекочитаемое «где был юзер»: вкладка или путь. Неизвестное отдаём как есть. */
export function describeScreen(screen: string | null | undefined): string | null {
  if (!screen) return null;
  if (TAB_LABELS[screen]) return `вкладка «${TAB_LABELS[screen]}»`;
  if (screen.startsWith("/")) return `страница ${screen}`;
  return screen;
}

/** Экран для отчёта: на главной (SPA на «/») важна вкладка, на остальных — путь без id. */
export function screenFromLocation(pathname: string, activeTab: string | null | undefined): string {
  if (pathname === "/" || pathname === "") return activeTab || "/";
  // cuid и длинные токены в пути (/split/<groupId>) — не данные для багрепорта
  return pathname
    .split("/")
    .map((seg) => (seg.length >= 16 && /^[A-Za-z0-9_-]+$/.test(seg) ? ":id" : seg))
    .join("/")
    .slice(0, 120);
}

/** Короткая подпись устройства из User-Agent: «Chrome 130 · Android». Без парсинга версий ОС. */
export function describeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const pick = (re: RegExp) => ua.match(re)?.[1];
  let browser: string | null = null;
  // Порядок важен: Edge/Opera/Yandex/Samsung тоже содержат «Chrome», Chrome iOS — «CriOS»
  const edge = pick(/(?:Edg|EdgA|EdgiOS)\/(\d+)/);
  const yandex = pick(/YaBrowser\/(\d+)/);
  const opera = pick(/(?:OPR|OPiOS)\/(\d+)/);
  const samsung = pick(/SamsungBrowser\/(\d+)/);
  const firefox = pick(/(?:Firefox|FxiOS)\/(\d+)/);
  const chrome = pick(/(?:Chrome|CriOS)\/(\d+)/);
  const safari = pick(/Version\/(\d+)[\d.]*.*Safari/);
  if (edge) browser = `Edge ${edge}`;
  else if (yandex) browser = `Яндекс Браузер ${yandex}`;
  else if (opera) browser = `Opera ${opera}`;
  else if (samsung) browser = `Samsung Internet ${samsung}`;
  else if (firefox) browser = `Firefox ${firefox}`;
  else if (chrome) browser = `Chrome ${chrome}`;
  else if (safari) browser = `Safari ${safari}`;
  // Встроенные браузеры соцсетей ломают половину веб-API — для багов это главная улика
  if (/Instagram|FBAN|FBAV|musical_ly|BytedanceWebview|TikTok/i.test(ua)) browser = `${browser ?? "WebView"} (встроенный браузер)`;

  let os: string | null = null;
  if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux|X11/i.test(ua)) os = "Linux";

  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

/** Мягкая проверка адреса: отсекает опечатки, но не пытается быть RFC-валидатором. */
export function isPlausibleEmail(raw: string): boolean {
  const v = raw.trim();
  return v.length <= 254 && EMAIL_RE.test(v);
}

export function parseFeedbackType(raw: unknown): FeedbackType {
  return (FEEDBACK_TYPES as readonly string[]).includes(String(raw)) ? (String(raw) as FeedbackType) : "bug";
}

/** Контекст обращения: клиенту не доверяем — режем длину и убираем управляющие символы. */
export function cleanContextField(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const v = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return v || null;
}

export type ParsedMessage = { ok: true; message: string } | { ok: false; error: string };

/** Текст обращения/реплики: пустой и слишком длинный отбиваем с понятной причиной. */
export function parseMessageText(raw: unknown, max: number): ParsedMessage {
  const message = typeof raw === "string" ? raw.trim() : "";
  if (!message) return { ok: false, error: "Напиши хотя бы пару слов" };
  if (message.length > max) return { ok: false, error: `Максимум ${max} символов` };
  return { ok: true, message };
}

/**
 * Статус после новой реплики. Юзер дописал — очередь админа (даже если было «закрыто»:
 * иначе повторное сообщение осело бы в архиве, который никто не читает).
 * Админ ответил на «новое» — это уже «в работе»; закрытое/в работе не трогаем.
 */
export function statusAfterMessage(author: FeedbackAuthor, current: FeedbackStatus): FeedbackStatus {
  if (author === "user") return "new";
  return current === "new" ? "in_progress" : current;
}

/** Непрочитанный ответ: админ писал позже, чем автор последний раз открывал обращение. */
export function hasUnreadReply(lastAdminMessageAt: Date | string | null, userSeenAt: Date | string | null): boolean {
  if (!lastAdminMessageAt) return false;
  if (!userSeenAt) return true;
  return new Date(lastAdminMessageAt).getTime() > new Date(userSeenAt).getTime();
}

/** Чья очередь, для списка в админке: ждёт ответа админа только «new». */
export function isAwaitingAdmin(status: FeedbackStatus): boolean {
  return status === "new";
}

/** Заготовки быстрых ответов в админке: клик подставляет текст, правится перед отправкой. */
export const QUICK_REPLIES: { label: string; text: string }[] = [
  { label: "Спасибо, смотрим", text: "Спасибо, что написали! Мы посмотрим и вернёмся с ответом." },
  {
    label: "Уточнить детали",
    text: "Спасибо за сообщение! Чтобы разобраться, уточните, пожалуйста: что именно вы нажимали и что увидели на экране? Скриншот тоже поможет.",
  },
  { label: "Исправили", text: "Исправили — обновите страницу или перезапустите приложение, и всё должно заработать. Если нет — напишите сюда." },
  { label: "Добавили в планы", text: "Хорошая идея, записали в планы. Как только дойдут руки — расскажем в обновлении." },
  { label: "Не воспроизводится", text: "Пока не получается повторить у себя. Напишите, на каком устройстве и в каком браузере это происходит?" },
];
