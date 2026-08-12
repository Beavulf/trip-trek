# TripTrek — бриф: Инфо (InfoPanel)

> Для ИИ-агента: **только вкладка Инфо**. Mobile-first. Русский UI. Shared auth/`default-trip` — по `FIX-BRIEF.md`. Закрыть checklist integrity + Info UI (E5) + backup/push на вкладке.  
> Эталон empty: `dashboard.tsx`. Confirm-delete: `budget` / `board`.

**Файлы:**
- UI: `src/components/trip/info-panel.tsx` (сейчас = ChecklistView + hero)
- Вложенные: `push-settings.tsx`, `data-backup.tsx`
- Хуки: `useChecklist` / toggle/add/delete; `useInfo` / add/update/delete — **UI info не использует**
- Push: `use-push.ts` (параметр `tripId` **мёртвый**)
- API: `api/checklist`, `api/info`, `api/export`, `api/import`
- Push stub: `api/push`; БД: `api/push/subscribe` (UI не зовёт)
- Prisma: `ChecklistItem`, `InfoItem` (`contact|transport|food|tip`)
- WS: `checklist:updated`, `info:updated` (invalidate; toast map нет)
- Seeds: `seed-all` ok; `seed-info` / `seed-packing` **без tripId** — устарели
- from-template: **не** кладёт checklist/info
- FIX: §E5 Info UI, §B1 push default-trip, §A2 auth
- Вкладка: `page.tsx` (`info`), `app-shell` «Инфо»

**Смысл сейчас:** чек-лист + push + JSON backup.  
**По данным:** ещё справка поездки (контакты/транспорт/советы) — API живой, UI нет.

**Уже ок (не ломать):** нейтральные категории checklist; add checklist с `r.ok`; mobile delete видимы; `getTripId()` не возвращает `"default-trip"`.

---

## Карта

| Слой | Статус |
|------|--------|
| Checklist UI | Живой |
| InfoItem UI | API+hooks, **нет UI** |
| PushSettings | UI + hardcode `default-trip` |
| DataBackup | UI **не совместим** с API |
| Empty / auth | Нет |

---

## P0

### 1. GET checklist/info без tripId → вся БД
- Хуки без `enabled`.
- **Нужно:** API 400; `useCurrentTripId` + `enabled`; empty ≠ чужие данные.

### 2. Нет auth/membership
- checklist/info/export/import открыты.
- **Нужно:** `requireTripMember`; PATCH/DELETE — item ∈ trip.

### 3. DataBackup сломан
- Export UI без `?tripId=` → 400.
- Import ждёт `app === "TripTrek China"`; export без `app` → всегда fail.
- Filename `triptrek-china-…`.
- **Нужно:** tripId; согласовать маркер; нейтральное имя; import в текущий trip + membership.

### 4. PushSettings → `"default-trip"`
- `usePushNotifications("default-trip")`; tripId в хуке не используется.
- **Нужно:** текущий tripId или честный «глобально»; убрать default-trip; disable без trip.

### 5. `useAddInfo` без tripId в body → всегда 400
- **Нужно:** `{ …data, tripId }` + `r.ok` throw — иначе Info UI сразу мёртв.

### 6. Empty trip = 5 блоков «Пусто» / 0/0
- **Нужно:** CTA как Dashboard; loading; нет trip ≠ нет пунктов.

---

## P1

### 7. Info items не в UI (FIX E5)
- Минимальный list/add/edit/delete по type; RU лейблы нейтральные; без China city hardcode в словаре UI.

### 8. Checklist mutate: toast до ответа / нет `r.ok` на delete/toggle
### 9. Delete без confirm
### 10. Multi-user: общий `done` — anti double-submit; не обещать «личный»
### 11. China bias: import destination China; backup name; orphan seeds
### 12. Blank template без checklist/info — честный empty + CTA (не хардкод Alipay для Tokyo)
### 13. PATCH без id → 500; category ∉ cats невидимы но в progress
### 14. Enter на add во время pending
### 15. Push copy vs stub — честный «в разработке» или реальный `push/subscribe`

---

## P2

### 16. Схлопывать пустые категории
### 17. Achievements checklist stub — follow-up (`audit-achievements`)
### 18. Мёртвый `checklist:toggled` — выровнять или не трогать
### 19. Не дробить `info-panel` в bugfix-pass
### 20. Dashboard `DailyTip` China — вне scope Инфо

---

## Definition of Done

- [ ] GET без tripId → 400; enabled; empty CTA
- [ ] Auth на checklist/info/export/import (или явный follow-up)
- [ ] Backup roundtrip: export→import своего файла
- [ ] Push без `"default-trip"`
- [ ] Info UI минимальный; `useAddInfo` с tripId; WS sync
- [ ] Checklist: r.ok, confirm delete, нет ложного toast
- [ ] Нет China hardcode в **новом** Info UI
- [ ] Smoke: empty; China seed checklist+info; 2 клиента toggle; export/import; blank empty

## Don'ts

- Не рефакторить весь `use-trip` / не выносить папку
- Не per-user `done` без ТЗ
- Не возвращать runtime `"default-trip"`
- Не закрывать E5 «API unused» без минимального UI
- Не чинить только половину backup
- Не тащить dashboard cityTips China в Info
- Не migrate rename type/category

## Порядок

1. tripId gate + enabled + empty → 2. backup sync → 3. push default-trip → 4. useAddInfo + Info UI → 5. mutate integrity → 6. auth → 7. P1/P2 остаток

## Быстрые проверки

```
GET /api/checklist              → 400 (после фикса)
GET /api/export                 → 400
GET /api/export?tripId=…        → 200 + checklist + info
UI: без trip → empty CTA
UI: export → import того же файла → ок
UI: PushSettings не шлёт default-trip
```
