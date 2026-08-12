# TripTrek — бриф: Награды (Achievements)

> Для ИИ-агента: **только вкладка Награды**. Mobile-first. Русский UI. Нет dedicated API — клиентский пересчёт. Закрыть **честные счётчики + empty + валюту/дни**. Profile-бейджи — **не** этот pass.

**Файлы:**
- UI: `src/components/trip/achievements.tsx` (`ACHIEVEMENTS`, `AchievementCard`)
- Хуки: `useTrip`, `useExpenses` (есть); `useFoods`, `useChecklist` — **не подключены**
- Нет Prisma Achievement / WS event
- Trip stats: `api/trip/route.ts` (`currentDayNumber`, counts)
- Еда: `useFoods` / `FoodItem.tried`; чеклист: `useChecklist` / `info-panel`
- Profile (другое): `api/user` + `profile/page.tsx` — другие пороги
- China-seed bias: `seed-foods.ts` (16), `seed-all` checklist (15) = хардкоды UI
- Follow-up: `docs/audit-food-eda.md` §13
- Empty-эталон: `dashboard.tsx`
- Вкладка: `page.tsx` (`achievements`), `app-shell` «Награды»

**Смысл:** бейджи **текущей поездки** (не аккаунт). Сейчас часть метрик — stubs.

**Факт:** `triedFoods: 0`, `checklistDone: 0` → бейджи еды/чеклиста **никогда**.

---

## Косметика vs сломано

| Сломано | Косметика |
|---------|-----------|
| Еда/чеклист хардкод → never unlock | Tab «Награды» vs hero «Достижения» |
| Финишер/половина по календарю | Нет tap-expand (есть в Profile) |
| Шопоголик `$500` + settlement | Мёртвый `Icon`; эмодзи |
| Empty → `return null` | Нет celebration unlock |
| Trip vs Profile разные пороги | |

---

## P0

### 1. `triedFoods: 0`, `totalFoods: 16`
- Гурман/Шеф неразблокируемы; 16 = China seed.
- **Нужно:** `useFoods()`; live tried/total; пороги адаптивные если блюд мало; `enabled: !!tripId`.

### 2. `checklistDone: 0`, `checklistTotal: 15`
- «Готов к поездке» never; 15 = China seed.
- **Нужно:** live `useChecklist`; при total===0 — не unlock / не /0.

### 3. Empty: `if (!trip) return null`
- Blank под shell; нет skeleton/error.
- **Нужно:** empty Обзора + loading + error retry; не ложный `0/12`.

---

## P1

### 4. «Половина» / «Финишер» = календарь от `startDate`
- Copy врёт («пройти дни»); короткий trip → оба сразу.
- **Нужно:** честный copy **или** критерий по status дней / местам / `trip.status`.

### 5. «Шопоголик»: `$500` + settlement + игнор currency
- В Бюджете settlement режут; здесь нет.
- **Нужно:** `category !== "settlement"`; порог/символ из `trip.settings.currency`; один источник суммы.

### 6. Multi-user: общие метрики, copy как личные
- **Минимум:** «Бейджи поездки (общие)»; не смешивать с Profile. Per-user — отдельное ТЗ.

### 7. Stale: trip vs expenses источники; после wiring foods/checklist — WS keys уже ок

### 8. China bias косвенный (16/15); порог еды 12 при template = 4 блюда
- Только live counts; не хардкодить 16/15.

---

## P2

### 9. Mobile tap-expand описания (как Profile)
### 10. Toast/celebration при unlock (sessionStorage per trip)
### 11. Dual naming; unused Icon
### 12. a11y: карточки как button; aria на progress
### 13. Не плодить Prisma Achievement без ТЗ
### 14. Не чинить Profile grid в этом PR

---

## Definition of Done

- [ ] Empty/loading/error; нет blank null
- [ ] Еда + чеклист live; нет хардкодов 16/15
- [ ] Spent без settlement; валюта в copy
- [ ] Дни: честный критерий или copy
- [ ] Copy: бейджи поездки (общие)
- [ ] Mobile: описание читаемо
- [ ] Smoke: empty CTA; toggle 5 foods → Гурман; checklist all → Готов; EUR ≠ `$500`; 2 юзера общий unlock

## Don'ts

- Не рефакторить весь `use-trip`
- Не Prisma Achievement / per-user без ТЗ
- Не чинить Profile achievements в том же PR
- Не возвращать хардкоды 16/15
- Не ломать Budget settlement-семантику
- Не считать закрытым, пока еда+чеклист stub

## Порядок

1. Empty/loading → 2. useFoods → 3. useChecklist → 4. spent/currency → 5. дни → 6. copy + China → 7. P2 expand
