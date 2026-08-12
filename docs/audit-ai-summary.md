# TripTrek — бриф: AI-Итоги (AISummary)

> Для ИИ-агента: **только вкладка AI**. Mobile-first. Русский UI. Shared auth/`default-trip` — по `FIX-BRIEF.md`, но закрыть роут `ai-summary` в этом проходе.

**Файлы:**
- UI: `src/components/trip/ai-summary.tsx`
- Хук: `useAISummary`, `getTripId` — `src/hooks/use-trip.ts`
- API: `src/app/api/ai-summary/route.ts`
- SDK: `z-ai-web-dev-sdk` (dynamic import в route)
- Вкладка: `page.tsx` (`activeTab === "ai"`), `app-shell.tsx` label «AI»
- Данные trip для футера: `api/trip/route.ts`
- Auth helper (создать при отсутствии): `src/lib/api-auth.ts` по FIX-BRIEF
- Seed China: `prisma/seed-multi-trip.ts` (`default-trip`)
- Empty-эталон: `dashboard.tsx`

**Смысл:** три типа отчёта → POST LLM → markdown (итог поездки / день / советы) по местам, дням, тратам, журналу.

**Поток:** `mutate({ type })` → `POST /api/ai-summary?tripId=…` + body `{ type }` → ZAI chat → markdown в state. При ошибке SDK сейчас **HTTP 200** + шаблон.

---

## P0

### 1. API без auth/membership
- Любой с tripId читает journal/expenses/places и жжёт LLM.
- **Нужно:** JWT + member; 401/403.

### 2. Fallback `"default-trip"` на сервере
- Клиентский `getTripId()` уже может быть `""`, но route: `|| "default-trip"` → seed China.
- **Где:** `api/ai-summary/route.ts` ~tripId; `useAISummary` всегда шлёт query.
- **Нужно:** без tripId → 400; UI не звать API; empty CTA.

### 3. Тихий fallback SDK = «успешный AI»
- catch → 200 + шаблон («продолжаем исследовать»); UI бейдж «AI-сгенерировано».
- **Нужно:** 502/503 + `{ error }`; toast; не маскировать. Опционально явный «черновик без AI» с другим лейблом.

### 4. Нет rate-limit на LLM
- Открытый POST = стоимость/DoS.
- **Нужно:** per-user/per-trip лимит (+ premium gate если задумано).

---

## P1

### 5. Нет empty «нет поездки»
- Кнопки всегда активны; нет CTA как Dashboard.
- Disable generate; сброс content при смене tripId.

### 6. «Итог дня»: своя формула дня ≠ `api/trip.currentDayNumber`
- Расхождение ceil vs floor+setHours; нет picker дня.
- **Нужно:** одна shared функция; опционально выбор дня.

### 7. Данные грузятся, но слабо в промпте
- photos почти не используются; journals только в day; members = count.
- Empty copy обещает «места, записи, траты и фото» — либо наполнить промпт, либо честный copy.

### 8. Валюта всегда `$` в промптах и footer
- `trip.currency` + символ как на Обзоре.

### 9. China leakage только через default-trip (см. P0.2)
- Destination брать только из текущей поездки (уже так при верном id).

### 10. Мёртвый `invalidateQueries(["ai-summary"])`
- Нет useQuery с этим ключом; state локальный → после switch trip старый markdown.
- Сброс state по tripId; или cache key `["ai-summary", tripId, type]`.

### 11. Clipboard без try/catch (mobile HTTP / permissions)
- Toast success при silent fail.
- try/catch + fallback; toast только при успехе.

### 12. Нет provenance «это не AI» при шаблоне (связано с P0.3)

---

## P2

### 13. Mobile: copy/refresh hit ≥44px
### 14. Double-submit — почти ок (`isPending`); hint «повторить» при ошибке
### 15. Hero violet/AI look — опционально ближе к cover поездки
### 16. Streaming / история в БД — не в первом проходе
### 17. Вынести `use-ai-summary.ts` только если трогаете хуки иначе
### 18. System prompt: «русский + markdown»; лимит длины списков мест
### 19. totalSpent без фильтра settlement (как Budget `isRealExpense`)

---

## Definition of Done

- [ ] POST: auth + membership; без tripId → 400 (нет default-trip)
- [ ] SDK fail → error HTTP; UI toast; нет бейджа AI на шаблоне
- [ ] Rate-limit
- [ ] Empty без trip; generate disabled; сброс content при смене trip
- [ ] Итог дня = общая формула currentDayNumber
- [ ] Промпты богаче **или** copy не врёт; валюта trip; spent без settlement
- [ ] Clipboard безопасен на mobile
- [ ] Manual: не China на Tokyo trip; 401 без сессии; 403 чужой tripId

## Ручной регресс

1. Без cookie → 401  
2. Чужой tripId → 403  
3. Нет current trip → empty UI, API 400  
4. Tokyo trip → текст про Tokyo  
5. Сломанный ZAI → error, не «AI-сгенерировано»  
6. День N = Dashboard  
7. Mobile 375px: типы, skeleton, copy, refresh, pb под tab bar  

## Чего не делать

- Не оставлять `|| "default-trip"`.
- Не 200 с fake copy при падении SDK.
- Не только UI-disable без серверного auth.
- Не хардкодить China в промптах.
- Не стриминг/история до закрытия P0/P1.
- Не новый OAuth — допилить custom JWT.
- Не коммитить без просьбы.
