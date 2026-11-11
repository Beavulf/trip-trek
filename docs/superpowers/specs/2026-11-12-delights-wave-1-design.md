# Волна 1 «Моменты-праздники» — дизайн

Дата: 2026-11-12 · Статус: на ревью
Контекст: карта delights (аудит 2026-11-12) показала: базовая полировка есть
(framer-motion, хаптика, награды, sonner, скелетоны, шиты, Web Share, живой копирайтинг),
но нет **пиковых моментов** — разблокировка награды подаётся тостом, финал поездки —
утилитарным баннером про долги, «Итоги» существуют только как вариант шеринг-открытки.
По правилу пика и конца именно такие моменты формируют «послевкусие».

## Цели

- Праздник вместо уведомления: награды, закрытие долгов, финал поездки получают
  заметный визуальный момент.
- «Итоги поездки» как мгновение: анимированные цифры + готовая открытка `summary`.
- Ноль зависимостей, ноль изменений схемы/API — только клиент на уже приходящих данных.

## Не-цели

- Pull-to-refresh, свайп вкладок, звук, offline-hero (волны 2–4 карты delights).
- Серверные события для моментов: триггеры детектируются на клиенте.
- Редизайн существующих страниц наград/бюджета.

## 1. CelebrationOverlay — примитив

`src/components/trip/celebration-overlay.tsx` (новый).

- Портал `fixed inset-0 z-[200]` (поверх шитов `z-[100]`), фон `bg-black/60 backdrop-blur-sm`,
  карточка по центру с pop-пружиной (`scale 0.8→1`, stiffness ~320).
- Фейерверк на framer-motion, без библиотек: ~26 частиц — эмодзи путешествий
  (✈️🎉📸⛰️🍜🧭) + кружки в палитре приложения (терракота/золото/роза), радиальный
  разлёт из-за карточки с затуханием, 1.6–2.4 с, разброс задержек.
- `useReducedMotion` → карточка появляется фейдом, частицы разложены статично и гаснут
  (принятый в кодовой базе паттерн уважения к reduced-motion).
- Закрытие: тап по фону, кнопка «Понятно», «назад» через `useBackDismiss`
  (`src/hooks/use-back-dismiss.ts`). Автозакрытие 5 с — только когда `actions` пуст.

```ts
interface CelebrationProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  emoji: string;
  title: string;
  subtitle?: string;
  /** до 3 бейджей/строк контента (названия наград и т.п.) */
  items?: { emoji: string; title: string; note?: string }[];
  actions?: { label: string; onClick: () => void }[];
  /** поменьше, без фейерверка — для «Сочтёмся» */
  compact?: boolean;
}
```

- Открытие: `haptic([30,40,30])` (`src/lib/utils.ts`) — как у наград сейчас.

## 2. Триггер «награда разблокирована»

Место: `src/components/trip/achievements.tsx:182-210`. Детекция не меняется
(seen-set в localStorage, первый визит молчит) — меняется подача: пачка тостов
заменяется одним CelebrationOverlay:

- `fresh ≤ 3` → карточка с бейджами (`items`: эмодзи, название, `describeBadge`).
- `fresh > 3` → «Новых наград: N» + до 5 названий в `subtitle`.
- Actions: «Поделиться» (`shareText` уже в файле, текст коллекции как в
  `shareCollection`) и «Круто!».
- Подсветка `freshIds` на странице остаётся.

## 3. Финал поездки: TripFinale + праздничный баннер

`src/components/trip/dashboard/trip-finale.tsx` (новый, монтируется в Dashboard).
Один оркестратор авто-моментов финала — чтобы оверлеи не соревновались за экран:

- Считает то же, что `TripFinishedBanner`: `isTripFinished` +
  `moneyParticipants`/`calculateSettlements` → `hasDebts`, `hadSpending`.
- **«Долги закрыты! 🤝»** — раз за поездку: флаг `had-debts` (`localStorage`)
  ставится при `hasDebts`; при переходе к `!hasDebts` с поставленным флагом →
  CelebrationOverlay, флаг `debt-clear-seen` гасит повтор.
- **Авто-«Итоги»**: поездка завершена, долгов нет, `hadSpending`, recap не показывали
  (`tt-recap-seen-<tripId>`) → через ~1 с после маунта открыть RecapSheet.
  Если в этой сессии сработало празднование долгов — recap открывается после его
  закрытия, не одновременно.
- `TripFinishedBanner.tsx:84-88`: ветка `!hasDebts && hadSpending` — праздничная:
  «Поездка состоялась 🎉» + кнопка «Смотреть итоги» (RecapSheet без guard'а).
  Ветка с долгами не меняется.

## 4. RecapSheet «Итоги поездки»

`src/components/trip/dashboard/recap-sheet.tsx` (новый) на `MobileBottomSheet`
(портал, свайп, «назад» — из коробки).

- Крупные `AnimatedNumber` (`src/components/trip/budget/AnimatedNumber.tsx`),
  данные из `TripSummary`: 🗓 дни · 📍 `visitedPlaces`/`totalPlaces` · 📸 `totalPhotos` ·
  💰 `totalSpent` + символ валюты · 📔 `totalJournals`. Стаггер строк.
- CTA «Открытка "Итоги" →»: `ShareCard` получает опциональный проп
  `initialVariant?: CardVariantId` (сейчас `useState("story")`, `share-card.tsx:34`)
  и открывается сразу на `summary`; дальнейший шеринг — штатный путь открытки.

## 5. «Сочтёмся»: «Чисто! 🤝»

`src/components/split/balance-tab.tsx` + `useGroupModel`: переход «были ненулевые
нетто-балансы → все нули» при наличии транзакций → compact CelebrationOverlay
«Чисто! 🤝» + haptic. Guard в localStorage per group, фиксация «были долги» — как в п.3.
Компакт — чтобы не ломать деловой тон раздела (изумрудная тема подхватится сама).

## 6. Чистая логика и тесты

`src/lib/celebrations.ts` (новый) — чистые функции + тесты рядом
(`src/lib/celebrations.test.ts`, vitest node-env):

- ключи seen-флагов (`debtHadKey`, `debtClearSeenKey`, `recapSeenKey` — по id сущности);
- `shouldCelebrateDebts(hadDebts, nowClear, seen)`;
- `shouldAutoRecap({ finished, hasDebts, hadSpending, seen })`;
- `pickBadgePresentation(fresh: Badge[])` → `{ mode: "list" | "count", ... }`.

## Границы и риски

- **Flicker оверлеев**: TripFinale держит очередь «один момент за раз»
  (п.3), триггер наград живёт на другой странице — столкновение невозможно.
- **Ложные срабатывания** при первом визите/сид-данных: seen-флаги
  инициализируются при первом наблюдении состояния, без празднования
  (тот же принцип, что у наград: `achievements.tsx:190-193`).
- **Засорение localStorage**: 3 ключа на поездку + 2 на split-группу — приемлемо,
  чистится вручную, критичных данных нет.
- Полноэкранный авто-оверлей может застать юзера «в моменте» — авто-показ
  только через 1 с после маунта Обзора и раз за поездку; спорный пункт,
  при ревью можно свести к ручным кнопкам баннера.

## Проверка

- `bun run lint`, `bun run test` (новые тесты в `src/lib/celebrations.test.ts`);
  тесты дат не затрагиваются.
- Живой прогон в браузере: награда (данные dev-сида), долги (создать/закрыть трату),
  финал (правка дат поездки), split-группа с переводом.
- Интеграция API не нужна.

## Документация (тем же коммитом)

- `docs/glossary.md` — «Фичи главного экрана»: моменты-праздники.
- `AGENTS.md` — карта репозитория: `src/lib/celebrations.ts`, компоненты
  `celebration-overlay` / `trip-finale` / `recap-sheet`.
- `worklog.md` — запись сессии.
