// Категории повседневных трат (в поездках свой справочник — lib/types EXPENSE_CATEGORIES).

export interface SplitCategory {
  label: string;
  emoji: string;
  color: string;
}

export const SPLIT_CATEGORIES: Record<string, SplitCategory> = {
  groceries: { label: "Продукты", emoji: "🛒", color: "#22c55e" },
  cafe: { label: "Кафе и доставка", emoji: "🍕", color: "#f97316" },
  rent: { label: "Аренда", emoji: "🏠", color: "#8b5cf6" },
  utilities: { label: "Коммуналка", emoji: "💡", color: "#eab308" },
  internet: { label: "Интернет и связь", emoji: "📶", color: "#06b6d4" },
  transport: { label: "Транспорт и такси", emoji: "🚕", color: "#0ea5e9" },
  home: { label: "Дом и быт", emoji: "🧴", color: "#14b8a6" },
  health: { label: "Здоровье", emoji: "💊", color: "#ef4444" },
  fun: { label: "Развлечения", emoji: "🎬", color: "#ec4899" },
  subscriptions: { label: "Подписки", emoji: "🔁", color: "#6366f1" },
  gifts: { label: "Подарки", emoji: "🎁", color: "#f43f5e" },
  other: { label: "Прочее", emoji: "💸", color: "#64748b" },
};

export const DEFAULT_SPLIT_CATEGORY = "groceries";

/** Неизвестная категория (старые данные, ручной запрос) считается «Прочим», а не ломает список. */
export const categoryOf = (key: string | null | undefined): string =>
  key && key in SPLIT_CATEGORIES ? key : "other";

// Подсказка категории по описанию: порядок важен — узкие группы раньше широких («такси из кафе» → транспорт).
// Только подсказка: пока пользователь сам не тронул категорию, форма подставляет найденную.
const HINTS: [string, RegExp][] = [
  ["rent", /аренд|съ[её]м|квартплат|хозяйк|хозяин|жильё|жилье/],
  ["utilities", /коммунал|жкх|электро|за свет|(?<![а-яё])газ(?![а-яё])|отоплен|водоснабж|гор(ячая)? вода|холодная вода|мусор|домофон|квитанц/],
  ["internet", /интернет|wi-?fi|вайфай|провайдер|мобильн|связь|тариф|сим-?карт|(?<![а-яё])мтс(?![а-яё])|\ba1\b|life:?\)|byfly|белтелеком/],
  ["subscriptions", /подписк|netflix|spotify|youtube|ютуб|яндекс ?плюс|кинопоиск|icloud|apple|chatgpt|telegram premium|\bivi\b|okko/],
  ["transport", /такси|uber|убер|yandex ?go|яндекс ?go|метро|автобус|маршрутк|электричк|бензин|заправк|парковк|проезд|каршеринг|самокат|поезд|билет на (поезд|автобус)/],
  ["health", /аптек|лекарств|таблетк|витамин|врач|стоматолог|клиник|анализ|больниц/],
  ["fun", /кино|театр|концерт|боулинг|квест|клуб(?![а-яё])|караоке|игр[аыу]|steam|стим|выставк|музей|парк аттракц/],
  ["gifts", /подар|цветы|букет|днюх|день рождения|открытк/],
  ["home", /хозтовар|бытов|химия|уборк|посуд|стирк|порошок|лампочк|ремонт|ikea|икеа|мебел|швабр|туалетн|губк|фильтр/],
  ["cafe", /кафе|ресторан|обед|ужин|завтрак|пицц|суши|ролл|бургер|кофе|доставк|макдон|kfc|вок|шаурм|(?<![а-яё])бар(?![а-яё])|пиво|бухло|вино(?![а-яё])|коктейл|столовая|бизнес-?ланч/],
  ["groceries", /продукт|магазин|супермаркет|пят[её]роч|евроопт|соседи|санта|гиппо|green|ашан|магнит|лента|перекр[её]ст|вкусвилл|хлеб|молок|овощ|фрукт|мясо|рынок|закупк|(?<![а-яё])вода(?![а-яё])/],
];

export function suggestCategory(description: string): string | null {
  const text = description.toLowerCase().trim();
  if (text.length < 3) return null;
  for (const [category, re] of HINTS) if (re.test(text)) return category;
  return null;
}
