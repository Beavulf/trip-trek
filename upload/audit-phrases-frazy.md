# TripTrek — бриф: Фразы (Phrasebook)

> Для ИИ-агента: **только вкладка Фразы**. Mobile-first. Русский UI. Связано: `FIX-BRIEF.md` фаза C; `docs/audit-itinerary-marshrut.md` (ложный промис generate при Add Day).

**Файлы:**
- UI: `src/components/trip/phrasebook.tsx`
- Хуки: `usePhrases`, `useTogglePhraseFavorite` — `use-trip.ts` (**нет** `useGeneratePhrases`)
- API list/fav: `src/app/api/phrases/route.ts` (GET, PATCH)
- API generate: `src/app/api/phrases/generate/route.ts` — **есть, UI не вызывает**
- Prisma: `Phrase` (`tripId`, `category`, `ru`, `cn`, `pinyin`, `favorite`, `audio?`, `order`)
- WS: `phrase:updated` → invalidate `["phrases"]`
- Seeds: `seed-all.ts` (ok); `seed-phrases.ts` **без** tripId — устарел
- Шаблоны: `from-template` кладёт фразы
- Поиск: `api/search` + `global-search.tsx`
- Смежно: `itinerary.tsx` AddDay ~636–639 обещает auto-фразы; `api/days` **не** зовёт generate
- Вкладка: `page.tsx` (`phrases`), `app-shell` «Фразы»

**Смысл:** разговорник (ru + текст страны + romanization), категории, поиск, TTS, Translate, общее избранное; для поездки «с нуля» — пакет через generate (`zh/ja/ko/th/fr/en/vi/es/de`).

**Факт:** UI/Translate/`cn` заточены под Китай; generate multi-lang уже на сервере.

---

## P0

### 1. GET без tripId → все phrases БД
- `if (tripId) where…` — пустая строка → leak.
- `usePhrases` без `enabled: !!tripId`.
- Empty: «Ничего не найдено» не отличает нет trip / нет фраз / пустой поиск.
- **Нужно:** 400 или reject без tripId; membership; хук `useCurrentTripId` + `enabled`; empty как на Обзоре vs «загрузить пакет» vs «поиск пуст».

### 2. API без auth
- GET/PATCH/generate открыты; PATCH по любому id; generate в чужой tripId.
- **Нужно:** `requireTripMember`; PATCH — phrase ∈ trip участника.

### 3. Generate не подключён
- Empty без CTA; шаблон ок, «с нуля» — пусто.
- Itinerary врёт про auto-фразы после Add Day.
- **Нужно:** empty: выбор языка + «Загрузить» → POST generate; pending; toast; invalidate; `created:0` → «уже есть»; `emitWS("phrase:updated")`. Либо реальный вызов из Add Day, либо убрать ложный copy в itinerary (**минимум** — честный текст).

### 4. Global search фраз без tripId
- Чужие фразы в поиске.
- **Нужно:** scope `tripId` (+ auth).

---

## P1

### 5. Google Translate `sl=zh-CN` хардкод
- **Где:** `phrasebook.tsx` ~294–295
- **Нужно:** `sl` из эвристики скрипта / языка пакета / `auto`; один helper с TTS.

### 6. Speech: дефолт zh для латиницы; iOS/голоса
- Нет match → `zh-CN`; en/fr без диакритики → китайский голос.
- **Нужно:** fallback en/auto; `voiceschanged`; disable пока speaking; честный toast + Translate как запасной путь.

### 7. Избранное общее на компанию
- `Phrase.favorite` один на всех.
- **Минимум:** copy «общее избранное поездки». Per-user — P2 + migrate.

### 8. Toggle без `r.ok` / pending
- **Нужно:** throw на !ok; error toast; disable на mutate.

### 9. Stale trip switch
- Params из `getTripId()` без reactive store / `enabled`.
- **Нужно:** как `useTrip`.

### 10. Fav badge без `relative` на кнопке
- Бейдж уезжает (`-top-1 -right-1`).

### 11. Naming China-centric при multi-lang
- Labels `cn`/`pinyin`, hero 🀄, Baidu/Pleco всегда.
- **Нужно:** нейтральные «Фраза» / «Произношение» если язык ≠ zh; не rename колонок БД.

### 12. Generate: нет WS; race двух generate → дубли
- emit после create; UI disable; желательно tx/count guard.

---

## P2

### 13. Категория `social` в UI vs дыры в generate-пакетах
### 14. Копировать фразу (cn + pinyin + ru) на mobile
### 15. Hero metrics: N фраз · M избранных
### 16. Per-user favorites (отдельное согласование)
### 17. Поле `audio` не использовать в этом проходе
### 18. Починить/удалить `seed-phrases.ts`
### 19. a11y labels на Слушать / Translate / Избранное

---

## Definition of Done

- [ ] GET scoped + `enabled`; нет leak
- [ ] Auth на GET/PATCH/generate
- [ ] Empty: нет trip ≠ нет фраз (язык + загрузить) ≠ пустой поиск/избранное
- [ ] Generate из UI; WS; itinerary copy честный или реальный вызов
- [ ] Translate `sl` не только zh-CN
- [ ] TTS без слепого zh для латиницы; smoke Android + iOS
- [ ] Favorite: r.ok, pending; badge `relative`
- [ ] Search scoped tripId
- [ ] Smoke: 2 юзера — favorite sync; generate один раз

## Don'ts

- Не migrate rename `cn`→`text`
- Не offline audio pipeline
- Не GET без обязательного tripId
- Не оставлять itinerary «auto-фразы» без вызова
- Не per-user fav через localStorage
- Не редизайн hero «под Китай» ради эстетики — только multi-lang нейтральность

## Порядок

1. tripId gate + auth + enabled + empty CTA  
2. generate UI + emitWS + itinerary copy  
3. Translate + speech helper  
4. toggle integrity + badge + search  
5. P2
