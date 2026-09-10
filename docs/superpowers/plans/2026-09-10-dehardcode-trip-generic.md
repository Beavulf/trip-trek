# De-hardcode: универсальность для любой поездки — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать хардкод под Китай/демо-данные из 7 мест, чтобы все функции (конвертер, траты, курсы валют, достижения, шаблоны, брендинг PWA, приглашения) работали одинаково для любой новой поездки.

**Architecture:** Правки точечные, без смены схемы БД и без новых зависимостей. Дефолты валют везде берутся из `trip.settings.currency`; запоминание валюты трат — scoped по tripId; API курсов отдаёт все живые курсы; денежное достижение пересчитывается в валюту поездки на границе контекста; шаблоны получают настоящие местные названия блюд; PWA-манифест и плейсхолдер становятся нейтральными.

**Tech Stack:** Next.js 15 App Router (client components), react-query (@/hooks/use-trip), Prisma/SQLite, localStorage (scoped ключи), zustand.

## Global Constraints

- Базовая линия `npx tsc --noEmit`: 15 ошибок, ВСЕ в `prisma/seed*.ts` (сломанные сиды, вне скоупа). После каждой задачи: те же 15, в `src/` — 0.
- Не трогать незакоммиченные чужие правки: `src/components/trip/data-backup.tsx`, `info-panel.tsx`, `push-settings.tsx`, `tmp-test-header.mjs` (git add — только изменённые задачей файлы).
- Схема БД не меняется (колонки `Phrase.cn`, `FoodItem.nameCn` — известный нейминг-долг, вне скоупа).
- Никаких новых npm-зависимостей.
- UI-копирайт — на русском, тон существующего приложения.
- Валютные курсы `/api/currency` — «количество валюты за 1 USD» (base USD).

---

### Task 1: Конвертер валют — дефолтная пара из валюты поездки

**Files:**
- Modify: `src/components/trip/currency-converter.tsx:3-14` (импорты, стейты), `:71-79` и `:103-111` (селекты)

**Interfaces:**
- Consumes: `useTrip()` из `@/hooks/use-trip` (даёт `trip.settings.currency`); `currencySelectOptions(tripCurrency)` из Task 2 (создаётся там — внедрять селекты в этом таске только после Task 2, либо сразу в этом таске создать хелпер; порядок исполнения: Task 2 → Task 1).
- Produces: компонент открывается с парой «валюта поездки ↔ USD».

- [ ] **Step 1: Правим импорты и стейты**

Заменить строки 3-14:

```tsx
import { useCurrency, useTrip } from "@/hooks/use-trip";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CURRENCIES, currencySelectOptions } from "@/lib/currencies";

export function CurrencyConverter() {
  const { data: rates, isLoading, isError, refetch, isFetching } = useCurrency();
  const { data: trip } = useTrip();
  const tripCurrency = trip?.settings?.currency;
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("CNY");
  const [userPicked, setUserPicked] = useState(false);

  // Дефолтная пара — валюта поездки ↔ USD (не жёсткий USD→CNY)
  useEffect(() => {
    if (userPicked || !tripCurrency) return;
    if (tripCurrency === "USD") {
      setFrom("USD");
      setTo("EUR");
    } else {
      setFrom(tripCurrency);
      setTo("USD");
    }
  }, [tripCurrency, userPicked]);
```

- [ ] **Step 2: Селекты — опции с валютой поездки + флаг userPicked**

Верхний селект (было `onChange={(e) => setFrom(e.target.value)}`):

```tsx
<select
  value={from}
  onChange={(e) => {
    setFrom(e.target.value);
    setUserPicked(true);
  }}
  className="rounded-lg border border-input bg-background px-2 py-2.5 text-sm w-28 min-h-11"
>
  {currencySelectOptions(tripCurrency).map((c) => (
    <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
  ))}
</select>
```

Нижний селект — аналогично с `setTo` + `setUserPicked(true)` и `currencySelectOptions(tripCurrency)`.

- [ ] **Step 3: Проверка tsc**

Run: `npx tsc --noEmit 2>&1 | grep -v "^prisma/" | grep -c "error TS"`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add src/components/trip/currency-converter.tsx
git commit -m "fix(budget): converter defaults to trip currency pair, not USD→CNY"
```

---

### Task 2: Хелпер запоминания валюты + опции селекта + форма трат (Budget)

**Files:**
- Create: `src/lib/currency-pref.ts`
- Modify: `src/lib/currencies.ts` (добавить `currencySelectOptions` в конец)
- Modify: `src/components/trip/budget/AddExpenseForm.tsx`

**Interfaces:**
- Produces: `getSavedCurrency(tripId: string | null | undefined): string | null`, `saveCurrency(tripId, code: string): void`, `clearSavedCurrency(tripId): void` из `@/lib/currency-pref`; `currencySelectOptions(tripCurrency?: string | null): { code: string; flag: string; name: string }[]` из `@/lib/currencies`. Используются Task 1 и Task 3.

- [ ] **Step 1: Создать `src/lib/currency-pref.ts`**

```ts
// Запомненная валюта трат — строго scoped по поездке: выбор из одной поездки
// не должен подставляться в другие (раньше был глобальный ключ triptrek-currency).
export function currencyPrefKey(tripId: string) {
  return `triptrek-currency:${tripId}`;
}

export function getSavedCurrency(tripId: string | null | undefined): string | null {
  if (typeof window === "undefined" || !tripId) return null;
  return localStorage.getItem(currencyPrefKey(tripId));
}

export function saveCurrency(tripId: string | null | undefined, code: string) {
  if (typeof window === "undefined" || !tripId) return;
  localStorage.setItem(currencyPrefKey(tripId), code);
}

export function clearSavedCurrency(tripId: string | null | undefined) {
  if (typeof window === "undefined" || !tripId) return;
  localStorage.removeItem(currencyPrefKey(tripId));
}
```

- [ ] **Step 2: Хелпер опций в `src/lib/currencies.ts`**

Добавить в конец файла:

```ts
/** Опции селекта валют: стандартный список + валюта поездки, если её в списке нет. */
export function currencySelectOptions(
  tripCurrency?: string | null
): { code: string; flag: string; name: string }[] {
  const list: { code: string; flag: string; name: string }[] = [...CURRENCIES];
  if (tripCurrency && !list.some((c) => c.code === tripCurrency)) {
    list.push({ code: tripCurrency, flag: "🏳️", name: tripCurrency });
  }
  return list;
}
```

- [ ] **Step 3: `AddExpenseForm.tsx` — дефолт из валюты поездки, scoped-память**

Импорты (строки 3, 7, 10):

```tsx
import { useEffect, useState } from "react";
import { useTrip, useAddExpense, useCurrency, useCurrentTripId } from "@/hooks/use-trip";
import { CURRENCIES, currencySelectOptions } from "@/lib/currencies";
import { getSavedCurrency, saveCurrency, clearSavedCurrency } from "@/lib/currency-pref";
```

Удалить локальную функцию `currencyKey` (строки 16-18). Стейты (строки 28-38):

```tsx
  const [currencyCode, setCurrencyCode] = useState(() => {
    if (typeof window === "undefined") return "USD";
    return getSavedCurrency(tripId) || "USD";
  });
  const [rememberCurrency, setRememberCurrency] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!getSavedCurrency(tripId);
  });
  const [currencyTouched, setCurrencyTouched] = useState(false);
```

После стейтов (рядом с `tripCurrency`):

```tsx
  const tripCurrency = trip?.settings?.currency;

  // Пока валюта не запомнена и пользователь не трогал селект — дефолтим к валюте поездки
  useEffect(() => {
    if (currencyTouched || !tripCurrency) return;
    if (getSavedCurrency(tripId)) return;
    setCurrencyCode(tripCurrency);
  }, [tripCurrency, tripId, currencyTouched]);
```

Селект валюты — опции и onChange:

```tsx
          <select
            value={currencyCode}
            onChange={(e) => {
              setCurrencyCode(e.target.value);
              setCurrencyTouched(true);
            }}
            className="rounded-lg border border-input bg-background px-2 py-2.5 text-sm font-medium"
          >
            {currencySelectOptions(tripCurrency).map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
            ))}
          </select>
```

В `submit` (строка 84-86):

```tsx
    if (rememberCurrency && tripId) {
      saveCurrency(tripId, currencyCode);
    }
```

В onChange чекбокса (строки 178-186):

```tsx
              onChange={(e) => {
                setRememberCurrency(e.target.checked);
                if (!tripId) return;
                if (e.target.checked) {
                  saveCurrency(tripId, currencyCode);
                } else {
                  clearSavedCurrency(tripId);
                }
              }}
```

- [ ] **Step 4: Проверка tsc**

Run: `npx tsc --noEmit 2>&1 | grep -v "^prisma/" | grep -c "error TS"`
Expected: `0`

- [ ] **Step 5: Commit**

```bash
git add src/lib/currency-pref.ts src/lib/currencies.ts src/components/trip/budget/AddExpenseForm.tsx
git commit -m "fix(budget): expense currency defaults from trip, memory scoped per trip"
```

---

### Task 3: Quick-add форма трат — тот же контракт

**Files:**
- Modify: `src/components/trip/quick-add/ExpenseForm.tsx`

**Interfaces:**
- Consumes: `getSavedCurrency`/`saveCurrency` из `@/lib/currency-pref`, `currencySelectOptions` из `@/lib/currencies` (Task 2), `useCurrentTripId` из `@/hooks/use-trip`.

- [ ] **Step 1: Импорты и tripId**

```tsx
import { useEffect, useState } from "react";
import { useTrip, useAddExpense, useCurrency, useCurrentTripId } from "@/hooks/use-trip";
import { CURRENCIES, currencySelectOptions } from "@/lib/currencies";
import { getSavedCurrency, saveCurrency } from "@/lib/currency-pref";
```

Внутри компонента, до стейтов: `const tripId = useCurrentTripId();`

- [ ] **Step 2: Стейт валюты + эффект дефолта**

```tsx
  const tripCurrency = trip?.settings?.currency;
  const [currencyCode, setCurrencyCode] = useState(() => {
    if (typeof window === "undefined") return "USD";
    return getSavedCurrency(tripId) || "USD";
  });
  const [currencyTouched, setCurrencyTouched] = useState(false);
```

Рядом с существующим useEffect для dayId:

```tsx
  // Дефолт — валюта поездки, пока пользователь не выбрал свою
  useEffect(() => {
    if (currencyTouched || !tripCurrency) return;
    if (getSavedCurrency(tripId)) return;
    setCurrencyCode(tripCurrency);
  }, [tripCurrency, tripId, currencyTouched]);
```

- [ ] **Step 3: Сохранение scoped вместо глобального ключа**

В `submit` заменить `localStorage.setItem("triptrek-currency", currencyCode);` (строка 83) на:

```tsx
      saveCurrency(tripId, currencyCode);
```

- [ ] **Step 4: Селект валюты — опции + touched**

```tsx
          <select
            value={currencyCode}
            onChange={(e) => {
              setCurrencyCode(e.target.value);
              setCurrencyTouched(true);
            }}
            className="w-full rounded-lg border border-input bg-background px-2 py-2.5 text-base input-mobile max-w-[5.5rem]"
          >
            {currencySelectOptions(tripCurrency).map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.code}
              </option>
            ))}
          </select>
```

- [ ] **Step 5: Проверка tsc**

Run: `npx tsc --noEmit 2>&1 | grep -v "^prisma/" | grep -c "error TS"`
Expected: `0`

- [ ] **Step 6: Commit**

```bash
git add src/components/trip/quick-add/ExpenseForm.tsx
git commit -m "fix(budget): quick-add expense saves currency per trip, defaults to trip currency"
```

---

### Task 4: API курсов — пропускать ВСЕ живые курсы

**Files:**
- Modify: `src/app/api/currency/route.ts:41-46`

- [ ] **Step 1: Не фильтровать живые курсы списком из 24 валют**

Заменить блок в `GET` (строки 41-46):

```ts
    // Пропускаем ВСЕ живые курсы (API отдаёт ~160 валют): поездка может быть
    // в валюте вне списка UI (EGP, BRL, ISK…). Для валют UI без живого курса — статичный fallback.
    const apiRates = (data.rates as Record<string, number> | undefined) ?? {};
    const rates: Record<string, number> = { ...apiRates };
    for (const [code, fbRate] of Object.entries(FALLBACK_RATES)) {
      if (!(typeof rates[code] === "number" && rates[code] > 0)) rates[code] = fbRate;
    }
```

- [ ] **Step 2: Проверка tsc**

Run: `npx tsc --noEmit 2>&1 | grep -v "^prisma/" | grep -c "error TS"`
Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/currency/route.ts
git commit -m "fix(api): currency endpoint returns all live rates, fallback only fills gaps"
```

---

### Task 5: Достижение «Шопоголик» — цель в валюте поездки

**Files:**
- Modify: `src/lib/achievements.ts`
- Modify: `src/components/trip/achievements.tsx`

**Interfaces:**
- Consumes: `useCurrency()` из `@/hooks/use-trip` → `{ data: { rates: Record<string, number> } }` (курс «за 1 USD»).
- Produces: `BIG_SPENDER_TARGET_USD = 500` (export); `AchievementContext.spendTarget: number` — цель в той же валюте, что `totalSpent`. Компонент конвертирует оба на границе, lib остаётся чистой от курсов.

- [ ] **Step 1: lib/achievements.ts — константа, контекст, бейдж**

После импортов:

```ts
/** Цель «Шопоголика» в канонических USD; на UI конвертируется в валюту поездки */
export const BIG_SPENDER_TARGET_USD = 500;
```

В `AchievementContext` добавить поле (после `totalSpent: number;`):

```ts
  /** Цель денежного бейджа в той же валюте, что и totalSpent */
  spendTarget: number;
```

Бейдж `big-spender` (строки 185-195):

```ts
  {
    id: "big-spender",
    title: "Шопоголик",
    description: "Совместные траты достигли цели",
    icon: Wallet,
    color: "#84cc16",
    emoji: "💸",
    check: (c) => c.totalSpent >= c.spendTarget,
    progress: (c) => ({ current: Math.min(Math.round(c.totalSpent), c.spendTarget), target: c.spendTarget }),
    cta: { tab: "budget", label: "Открыть бюджет" },
  },
```

`describeBadge` (строки 214-217) — target уже в валюте поездки (приходит из Badge):

```ts
/** Описание с валютой для денежных бейджей (badge.target — уже в валюте поездки) */
export function describeBadge(a: AchievementDef & { target?: number }, sym: string): string {
  if (a.id !== "big-spender") return a.description;
  const target = a.target && a.target > 0 ? a.target : BIG_SPENDER_TARGET_USD;
  return `Потратить ${sym}${target.toLocaleString("ru-RU")}`;
}
```

- [ ] **Step 2: achievements.tsx — конвертация на границе**

В импорт из `@/lib/achievements` добавить `BIG_SPENDER_TARGET_USD`; в импорт из `@/hooks/use-trip` — `useCurrency`. В компоненте:

```tsx
  const { data: fx } = useCurrency();
```

В `badges` useMemo (строки 125-148):

```tsx
    const rate = fx?.rates?.[trip.settings.currency];
    const spendTarget = rate && rate > 0 ? Math.round(BIG_SPENDER_TARGET_USD * rate) : BIG_SPENDER_TARGET_USD;
    const realExpenses = expenses?.filter((e) => e.category !== "settlement") ?? [];
    const totalSpent = realExpenses.reduce((s, e) => s + e.amount, 0);
    return computeBadges({
      // ...все поля как были, кроме:
      totalSpent: rate && rate > 0 ? totalSpent * rate : totalSpent,
      spendTarget,
      // ...
    });
  }, [trip, expenses, foods, checklist, fx]);
```

В `remainingLine` (строка 58) remaining уже в валюте поездки — только форматирование:

```tsx
  if (b.id === "big-spender") return `Ещё ${sym}${remaining.toLocaleString("ru-RU")} — и «${b.title}» ваш`;
```

- [ ] **Step 3: Проверка tsc**

Run: `npx tsc --noEmit 2>&1 | grep -v "^prisma/" | grep -c "error TS"`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add src/lib/achievements.ts src/components/trip/achievements.tsx
git commit -m "fix(achievements): big-spender target converted to trip currency"
```

---

### Task 6: Шаблоны — настоящие местные названия блюд

**Files:**
- Modify: `src/lib/trip-templates.ts:25-32` (комментарий к интерфейсу), `:133-137` (Япония), `:171-175` (Европа), `:208-212` (Таиланд)

- [ ] **Step 1: Комментарий к полю (имя поля — нейминг-долг БД, не переименовываем)**

```ts
export interface TemplateFood {
  name: string;
  /** Местное название блюда (поле исторически называется nameCn — колонка БД nameCn) */
  nameCn: string;
  description: string;
  city: string;
  price: string;
  emoji: string;
}
```

- [ ] **Step 2: Заменить китайский текст на местные языки**

Япония (`japan-tokyo`, поле nameCn = японский):

```ts
    foods: [
      { name: "Суши", nameCn: "寿司", description: "Свежие суши на Цукидзи", city: "Токио", price: "$10-30", emoji: "🍣" },
      { name: "Рамен", nameCn: "ラーメン", description: "Свиная лапша в бульоне", city: "Токио", price: "$8-12", emoji: "🍜" },
      { name: "Темпура", nameCn: "天ぷら", description: "Овощи и морепродукты в кляре", city: "Токио", price: "$12-20", emoji: "🍤" },
    ],
```

Европа (`europe-classic`, французский):

```ts
    foods: [
      { name: "Круассан", nameCn: "Croissant", description: "Свежая выпечка на завтрак", city: "Париж", price: "$2-4", emoji: "🥐" },
      { name: "Багет", nameCn: "Baguette", description: "Свежий французский хлеб", city: "Париж", price: "$1-3", emoji: "🥖" },
      { name: "Стейк-фрит", nameCn: "Steak-frites", description: "Стейк с картошкой фри", city: "Париж", price: "$15-25", emoji: "🥩" },
    ],
```

Таиланд (`thailand-beach`, тайский):

```ts
    foods: [
      { name: "Пад Тай", nameCn: "ผัดไทย", description: "Жареная рисовая лапша", city: "Бангкок", price: "$2-4", emoji: "🍜" },
      { name: "Том Ям", nameCn: "ต้มยำกุ้ง", description: "Острый суп с креветками", city: "Бангкок", price: "$3-5", emoji: "🍲" },
      { name: "Манго стики райс", nameCn: "ข้าวเหนียวมะม่วง", description: "Сладкий рис с манго", city: "Бангкок", price: "$2-3", emoji: "🥭" },
    ],
```

- [ ] **Step 3: Проверка tsc**

Run: `npx tsc --noEmit 2>&1 | grep -v "^prisma/" | grep -c "error TS"`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add src/lib/trip-templates.ts
git commit -m "fix(templates): real local dish names instead of Chinese for non-China templates"
```

---

### Task 7: Нейтральный PWA-манифест + плейсхолдер кода

**Files:**
- Modify: `public/manifest.webmanifest:2-4`
- Modify: `src/app/join/page.tsx:134`

- [ ] **Step 1: Манифест**

```json
  "name": "TripTrek — планировщик групповых путешествий",
  "short_name": "TripTrek",
  "description": "Маршрут, бюджет, фото, дневник и разговорник для совместной поездки в любую страну",
```

- [ ] **Step 2: Плейсхолдер (формат-пример, не реальный код чужой поездки)**

```tsx
                placeholder="Например, ABCD1234"
```

- [ ] **Step 3: Проверка JSON и tsc**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/manifest.webmanifest','utf8')); console.log('ok')"` → `ok`
Run: `npx tsc --noEmit 2>&1 | grep -v "^prisma/" | grep -c "error TS"` → `0`

- [ ] **Step 4: Commit**

```bash
git add public/manifest.webmanifest src/app/join/page.tsx
git commit -m "fix(pwa): neutral app branding and join-code placeholder"
```

---

### Task 8: Финальная верификация

- [ ] **Step 1: Полный tsc**

Run: `npx tsc --noEmit 2>&1 | grep -cE "error TS"`
Expected: `15` (все — прекоммитные, в prisma/seed*.ts)

- [ ] **Step 2: Линт изменённых файлов**

Run: `npx eslint src/lib/currency-pref.ts src/lib/currencies.ts src/lib/achievements.ts src/lib/trip-templates.ts src/components/trip/currency-converter.tsx src/components/trip/budget/AddExpenseForm.tsx src/components/trip/quick-add/ExpenseForm.tsx src/components/trip/achievements.tsx src/app/join/page.tsx`
Expected: 0 ошибок

- [ ] **Step 3: Продакшн-сборка**

Run: `npm run build`
Expected: сборка завершается успешно

- [ ] **Step 4: Отчёт**

Свести изменения в итоговое сообщение пользователю: что исправлено, что осталось (демо-кнопки логина, cityTips, city-coords и т.п. — вне скоупа).
