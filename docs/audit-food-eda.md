# TripTrek — бриф: Еда (FoodGuide)

> Для ИИ-агента: **только вкладка Еда**. Mobile-first. Русский UI. Shared auth — по `FIX-BRIEF.md`; в этом проходе закрыть `foods` API + delete UI + empty states.

**Файлы:**
- UI: `src/components/trip/food-guide.tsx`
- Хуки: `useFoods`, `useAddFood`, `useUpdateFood`, `useDeleteFood`, `useUploadFoodPhoto` — `src/hooks/use-trip.ts`
- API: `src/app/api/foods/route.ts` (GET/POST/DELETE/PATCH + multipart)
- Prisma: `FoodItem` в `prisma/schema.prisma`
- WS: `food:updated` — `ws-emit.ts`, invalidate в `use-websocket.ts`; toast в `notification-map.ts` **нет**
- Мёртвый тип: `websocket-client.ts` — `food:tried` (не используется)
- Сиды: `trip-templates.ts`, `api/trips/from-template`
- Вкладка: `page.tsx` (`food`), `app-shell.tsx`
- Эталон delete-UI: `journal.tsx` / `board.tsx` / `budget.tsx`
- Уже отмечено: `FIX-BRIEF.md` §E2

**Смысл:** чеклист блюд поездки — город/статус, tried, рейтинг, фото, add. Города в фильтрах **из данных** (не хардкод China) — сохранить.

**Факт:** delete hook + `Trash2` импортированы, кнопки удаления **нет**.

---

## P0

### 1. Delete в API/хуке, нет в UI
- **Где:** `food-guide.tsx` (`FoodCard`); `useDeleteFood`; `DELETE /api/foods?id=`
- **Нужно:** confirm → mutate → toast; pending; error toast; `r.ok` в хуке.

### 2. GET без tripId → все foods БД
- `where` только если tripId truthy; пустой id → leak.
- `useFoods` без `enabled: !!tripId`.
- **Нужно:** API 400 без tripId; хук `enabled`; empty trip ≠ чужие блюда.

### 3. Нет auth/membership
- Любой CRUD/upload по id.
- **Нужно:** `requireTripMember` (GET/POST по tripId; PATCH/DELETE по `food.tripId`).

---

## P1

### 4. Empty «ничего» = нет блюд = пустой фильтр
- **Нужно:** «Пока нет блюд» + CTA add ≠ «Ничего не найдено» + сброс фильтра.

### 5. Ложные success-toast / нет `r.ok`
- Toggle/rating/add/delete: toast без проверки ответа.
- **Нужно:** `if (!r.ok) throw`; success только в onSuccess; disable на pending.

### 6. Multi-user: общий `tried`
- Один Boolean на блюдо для всей группы; last-write-wins.
- **Минимум:** anti double-submit; не делать per-user tried без согласования схемы.
- Опционально: WS toast (сейчас только invalidate).

### 7. China bias в форме
- Placeholder «点心», поле `nameCn`.
- **Нужно:** нейтральный placeholder; **не** rename колонки БД; не хардкодить города China в фильтры.

### 8. Upload без лимитов; PATCH без id
- **Нужно:** reject без id; size/MIME; 404; клиентский error toast.

### 9. Мёртвый `food:tried`
- Выровнять типы под `food:updated` или не трогать; не плодить второй event.

---

## P2

### 10. Sticky `top-[6.5rem]` vs header+tabs на mobile
### 11. Нет edit полей блюда после create (только tried/rating/photo/delete) — опционально
### 12. Цвета городов все orange; нет текстового поиска
### 13. Achievements: `triedFoods: 0`, `totalFoods: 16` хардкод — follow-up
### 14. Не дробить `food-guide.tsx` в bugfix-pass

---

## Definition of Done

- [ ] Delete на карточке с confirm; WS invalidate у других
- [ ] GET без tripId → 400; empty trip → пустой список
- [ ] Auth membership, если `api-auth` готов (иначе явный follow-up)
- [ ] Мутации с `r.ok`; нет ложного success
- [ ] Empty: нет блюд ≠ фильтр пуст
- [ ] Нет China city hardcode в фильтрах
- [ ] Smoke: template foods → toggle → rating → photo → add → delete; 2 вкладки sync

## Don'ts

- Не рефакторить весь `use-trip.ts` / не выносить `food-guide/` (REFACTOR-BRIEF)
- Не migrate rename `nameCn`
- Не возвращать хардкод GZ/SZ/HK/Macau в фильтры
- Не per-user `tried` без согласования
- Не второй WS event `food:tried`
- Не считать закрытым без delete UI (FIX-BRIEF E2)

## Порядок

1. P0-2 (enabled + require tripId) → 2. P0-1 delete UI → 3. P1-5 r.ok → 4. empty → 5. auth → 6. P1-4/8, P2
