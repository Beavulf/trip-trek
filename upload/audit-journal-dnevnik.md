# TripTrek — бриф: Дневник (Journal)

> Для ИИ-агента: **только Дневник**. Mobile-first. Мультипользовательская поездка (авторы видны). Русский UI.

**Файлы:**
- UI: `src/components/trip/journal.tsx`
- Quick-add форма: `src/components/trip/quick-add.tsx` (`JournalForm`)
- Хуки: `useJournal` / `useAddJournal` / `useDeleteJournal`, `getTripId` — `src/hooks/use-trip.ts`
- API: `src/app/api/journal/route.ts`
- Prisma: `JournalEntry` в `prisma/schema.prisma`
- Types: `src/lib/types.ts` (`JournalEntry`)
- WS: `use-websocket.ts` (`journal:added` / `journal:deleted`); emit `ws-emit.ts`; toast map `server/notification-map.ts`
- Вкладка: `page.tsx`, `app-shell.tsx` (бейдж `totalJournals`)
- Trip summary: `api/trip/route.ts` (`currentUserId: null`, `totalJournals`)
- Поиск: `api/search/route.ts` (journal без фильтра trip — смежно)
- Timeline: журналы **не** подключены (`timeline.tsx` stub)
- Референс: `board.tsx` (автор), `budget.tsx` (confirm delete), `info-panel.tsx` (mobile delete visibility)

**Смысл:** заметки по дням с mood; вся компания видит ленту; добавить/удалить.

---

## P0

### 1. Автор с вкладки Дневник всегда анонимный
- UI шлёт `userId: trip.settings.currentUserId`, а trip API всегда `currentUserId: null` → `userId=null` в БД.
- Quick-add / Board берут `session.user.id` — работают.
- **Где:** `journal.tsx` submit; `api/trip/route.ts` ~`currentUserId: null`.
- **Нужно:** `session?.user.id` как в Board; показать автора / «вы».

### 2. GET `/api/journal` без tripId → все записи всех поездок
- `if (tripId) where…`; пустая строка → `where={}`.
- `useJournal` без `enabled: !!tripId`.
- **Где:** `api/journal/route.ts`; `use-trip.ts`.
- **Нужно:** без tripId → `[]`/400; хук enabled + свежий tripId.

### 3. POST не проверяет `dayId ∈ tripId`
- Чужой/битый dayId → запись в count, но не в ленте (группировка по `trip.days`).
- **Нужно:** validate day.tripId; UI при `days.length===0` — CTA «добавить день», не silent return.

### 4. Delete без прав / без confirm / toast до успеха
- Любой DELETE по id; toast сразу; на mobile кнопка `opacity-0 group-hover` — почти невидима.
- **Нужно:** confirm; toast в onSuccess; `md:opacity-0` паттерн (на mobile всегда видно); API ownership/member.

---

## P1

### 5. Delete hit-area / a11y на тач
- Паттерн как `info-panel`: видно на mobile; ≥44px; `aria-label`.

### 6. Empty: нет дней vs нет записей — разные копирайты + disable submit

### 7. Хуки без `r.ok` → ложный success
- `useAddJournal` / `useDeleteJournal`; try/catch + не чистить textarea при fail.

### 8. Мультиавторский UX слабый
- После фикса userId: аватар, «вы», chip-фильтр по участнику.

### 9. WS: `await emitWS` на POST; не дублировать toast актёру (опционально)

### 10. Валидация content: trim, max length, mood whitelist

### 11. Global search journal без tripId
- **Где:** `api/search/route.ts`; клик только открывает таб.
- Фильтр текущим tripId + опционально highlight.

---

## P2

### 12. Подключить journal в Timeline (`useJournal`)
### 13. Единый `MOODS` для Journal и QuickAdd
### 14. Edit / поиск / sort внутри вкладки
### 15. Sticky day header `top-[6.5rem]` — overlap с header на узких экранах
### 16. Per-row pending на delete
### 17. Не расширять мёртвый `websocket-client.ts`

---

## Definition of Done

- [ ] Запись с вкладки сохраняет реальный `userId`; автор виден
- [ ] GET всегда scoped по tripId; хук enabled
- [ ] POST: day принадлежит trip; empty без дней с CTA
- [ ] Delete: confirm, toast после успеха, кнопка на mobile
- [ ] API errors → toast.error; форма не сбрасывается зря
- [ ] WS: второй участник видит add/delete и бейдж totalJournals
- [ ] Два empty-состояния; smoke desktop+mobile, 2 юзера
- [ ] Не регрессировать QuickAdd JournalForm / Board author

## Порядок работ

1. Author via session + GET tripId gate + day validate + hook enabled  
2. Mobile delete + confirm + error handling  
3. Empty UX  
4. Author filter / moods / timeline (P2)

## Чего не делать

- Не `userId: trip.settings.currentUserId` без session.
- Не GET без обязательного tripId.
- Не только `group-hover` для delete на mobile.
- Не toast до onSuccess.
- Не тащить логику в `websocket-client.ts`.
- Не большой редизайн hero.
- Не коммитить без просьбы.
- Не Prisma migrate без нужды (`userId` уже optional).
