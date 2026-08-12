// Полный список поддерживаемых валют (24 валюты)
// Используется в AddExpenseForm, CurrencyConverter, и любом другом месте где нужен выбор валюты.
// P1 #9: единый source of truth — fallback API покрывает все эти валюты.
export const CURRENCIES = [
  { code: "USD", flag: "🇺🇸", name: "Доллар США" },
  { code: "EUR", flag: "🇪🇺", name: "Евро" },
  { code: "GBP", flag: "🇬🇧", name: "Фунт" },
  { code: "CNY", flag: "🇨🇳", name: "Юань" },
  { code: "JPY", flag: "🇯🇵", name: "Иена" },
  { code: "KRW", flag: "🇰🇷", name: "Вона" },
  { code: "HKD", flag: "🇭🇰", name: "Гонконг$" },
  { code: "MOP", flag: "🇲🇴", name: "Патака" },
  { code: "THB", flag: "🇹🇭", name: "Бат" },
  { code: "VND", flag: "🇻🇳", name: "Донг" },
  { code: "SGD", flag: "🇸🇬", name: "Сингапур$" },
  { code: "RUB", flag: "🇷🇺", name: "Рубль" },
  { code: "BYN", flag: "🇧🇾", name: "Бел.рубль" },
  { code: "UAH", flag: "🇺🇦", name: "Гривна" },
  { code: "KZT", flag: "🇰🇿", name: "Тенге" },
  { code: "TRY", flag: "🇹🇷", name: "Лира" },
  { code: "AED", flag: "🇦🇪", name: "Дирхам" },
  { code: "INR", flag: "🇮🇳", name: "Рупия" },
  { code: "IDR", flag: "🇮🇩", name: "Рупия ID" },
  { code: "MYR", flag: "🇲🇾", name: "Ринггит" },
  { code: "PHP", flag: "🇵🇭", name: "Песо" },
  { code: "AUD", flag: "🇦🇺", name: "Австрал$" },
  { code: "CAD", flag: "🇨🇦", name: "Канад$" },
  { code: "CHF", flag: "🇨🇭", name: "Франк" },
] as const;

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

/** Символ валюты для UI (бюджет, награды, поиск). */
export function currencySymbol(code: string | undefined | null): string {
  const map: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    CNY: "¥",
    JPY: "¥",
    KRW: "₩",
    HKD: "HK$",
    MOP: "MOP$",
    THB: "฿",
    VND: "₫",
    SGD: "S$",
    RUB: "₽",
    BYN: "Br",
    UAH: "₴",
    KZT: "₸",
    TRY: "₺",
    AED: "د.إ",
    INR: "₹",
    IDR: "Rp",
    MYR: "RM",
    PHP: "₱",
    AUD: "A$",
    CAD: "C$",
    CHF: "CHF",
  };
  return map[code || ""] || (code ? `${code} ` : "$");
}

