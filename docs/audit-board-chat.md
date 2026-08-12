# TripTrek — бриф: Чат (Board)

> Для ИИ-агента: **только вкладка Чат**. Mobile-first. Русский UI. Shared auth/`default-trip` — по `FIX-BRIEF.md`; в этом проходе закрыть board API + empty + WS pin + mobile actions.

**Файлы:**
- UI: `src/components/trip/board.tsx`
- Хуки: `useBoard`, `useAddBoardMessage`, `useTogglePinBoard`, `useDeleteBoardMessage` — `use-trip.ts`
- API: `src/app/api/board/route.ts`
- Prisma: `BoardMessage`
- WS: `board:added` / `board:deleted` — invalidate; `board:pinned` в emit/map есть, API **не** эмитит; map pin→added = ложный toast «новое»
- Auth client: `use-auth.ts`
- Смежно leak: `api/export` включает board без auth
- Empty-эталон: `dashboard.tsx`
- Delete-UX: `journal.tsx` / `budget.tsx` / `info-panel.tsx`
- Вкладка: `page.tsx` (`board`), `app-shell` «Чат»

**Смысл:** доска/чат группы: посты, pin, delete, realtime.

**Поток:** GET list → POST `{ content, userId, tripId }` → PATCH pin → DELETE `?id=`. Toast часто **до** ответа.

---

## P0

### 1. API без auth/membership
- Любой GET/POST/PATCH/DELETE по tripId/id.
- **Нужно:** session + member; DELETE/PIN — автор или owner (явная политика).

### 2. GET → fallback `"default-trip"`
- Пустой tripId с клиента → чужой чат seed.
- `useBoard` без `enabled` / без `useCurrentTripId` в key.
- **Нужно:** 400/`[]` без tripId; `enabled: !!tripId`; key `["board", tripId]`; empty как Обзор.

### 3. POST: spoof `userId` + любой tripId
- Клиент шлёт userId; сервер доверяет.
- **Нужно:** userId **только** из JWT; tripId + membership.

### 4. DELETE без прав / toast до ответа
- Trash у всех; `!r.ok` не проверяется.
- **Нужно:** policy; confirm; toast onSuccess; UI delete только себе (или owner).

### 5. Empty trip = «нет сообщений» или чужой default-trip
- Нет `!tripId` CTA / isError retry.
- **Нужно:** как Dashboard; empty «нет сообщений» только при своей поездке.

### 6. Stale cache при switch trip
- `getTripId()` в key без store → чужой чат в слоте.
- **Нужно:** `useCurrentTripId()`.

---

## P1

### 7. Pin без WS; `board:pinned` → опасный map на `board:added`
- Другие не видят pin; если emit как added — ложный toast.
- **Нужно:** emit pin отдельно + invalidate; **не** notification «новое сообщение».

### 8. Toast success до ответа; нет `r.ok`
- Форма чистится до успеха.
- **Нужно:** throw на !ok; success в onSuccess; fail → текст остаётся.

### 9. Двойной toast актёру на POST
- Локальный + WS notification всей комнате.
- **Нужно:** exclude self или один источник toast.

### 10. Mobile: pin/delete `opacity-0 group-hover`
- На таче невидимы; hit &lt; 44px.
- **Нужно:** всегда видно на mobile; ≥44px; `aria-label`.

### 11. Нет confirm на delete
### 12. Content: whitespace `"   "` проходит; нет max length
- **Нужно:** trim + 400; max ~2–4k.

### 13. Форма без логина → «Аноним»
- После auth-gate — disable + CTA войти.

### 14. Export без auth включает board (отметить / закрыть с auth)

### 15. Per-row pending / double-submit pin/delete

---

## P2

### 16. `listRef` мёртв — не redesign в мессенджер без ТЗ; честный copy «Доска» ок
### 17. Sticky composer overlap на узких экранах
### 18. Фильтр pinned / мои / поиск
### 19. Edit сообщения
### 20. Timeline board events — не в этом пассе
### 21. Unread badge в nav — позже

---

## Definition of Done

- [ ] Auth + нет `"default-trip"`; hooks enabled/key
- [ ] Empty/error как Обзор
- [ ] POST userId из сессии; чужой tripId → 403
- [ ] Delete/pin policy + confirm + mobile visible + r.ok
- [ ] Pin sync по WS без toast «новое»
- [ ] 2 юзера: post/delete sync; актёр без double-toast
- [ ] Content trim + max; smoke 375px

## Don'ts

- Не `|| "default-trip"`
- Не доверять client userId/tripId без membership
- Не map `board:pinned` → `board:added` + notification
- Не toast сразу после `mutate`
- Не только group-hover на mobile
- Не тащить board в Timeline / redesign мессенджера без ТЗ
- Не писать `api-auth` вразрез с `FIX-BRIEF.md`

## Порядок

1. Auth + tripId gate + hooks → 2. Empty/error → 3. POST session userId + validation → 4. Delete/pin policy + mobile → 5. WS pin + anti double-toast → 6. P2
