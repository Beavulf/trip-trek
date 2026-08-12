# TripTrek — Patch notes

## v0.2.12 — Галерея, Карта, Бюджет

### Безопасность
- Удаление фото — только автор или owner поездки
- Удаление трат — только плательщик или owner

### Бюджет
- Убран `placeholderData: []` у expenses / budget-plan
- Empty без поездки + CTA; ошибки через refetch
- Settlement key по паре + сумме (не по часу)

### Галерея / Карта
- Empty/error как в журнале; delete только своих (owner — любые)
- Карта: toast «посещено» после успеха; фильтры сбрасываются при смене trip
- Add place: reverse-geocode в useEffect; день не подставляется молча
- Invalidate `photos-geo` после upload/delete

## v0.2.11 — Дневник, Chill, Награды, Инфо

### Общее
- Убран `placeholderData: []` у journal / checklist / info / board
- Empty без поездки + CTA; ошибки через refetch

### Дневник
- Удаление только своих записей; mood/submit ≥44px

### Chill
- Wishlist сохраняет lat/lng (дедуп Nearby); reload при смене trip
- Hit targets wishlist / nearby

### Награды / Инфо
- Ждём foods+checklist перед прогрессом; честный copy про календарь
- Чек-лист: категория «Другое»; toggle pending по строке

## v0.2.10 — Погода, Фразы, Еда

### Фразы / Еда
- Нет `placeholderData: []` → нет ложного empty при загрузке
- Empty без поездки + CTA; ошибки через refetch (не reload)
- Фразы: счётчики hero по всем фразам (не по фильтру); hit targets ≥44px
- Еда: удаление всегда видно; валюта из settings; «попробовано» — общее для компании

### Погода / Маршрут
- Чипы и retry ≥44px
- Add Day: `encodeCustomKey` (корректные отрицательные coords)

## v0.2.9 — Профиль, Premium, Share, поиск

### Безопасность
- `/api/user`, avatar, upgrade, push subscribe — только session user (без spoof `userId`)
- GET профиля требует авторизацию; `visitedPlaces` считает реально посещённые

### Профиль
- Ошибка загрузки → retry, не вечный спиннер
- Push: toast только после успешного subscribe; hit target ≥44px
- Тема без ложной «Светлая» до hydrate; версия 0.2.9

### Share / поиск
- Share: empty без поездки; копирует invite-ссылку, не origin
- Поиск: debounce, tripId guard, error+retry; место/дневник открывают нужный день
- Mobile: bottom sheet search, larger close buttons

## v0.2.8 — Quick Add, поездки, join/login

### Быстрое добавление
- Sheet как у бюджета (`MobileBottomSheet`), empty без поездки/дней
- Expense/Journal: sync дня как у фото; валюта + конвертация; hit targets ≥44px
- Без сессии — формы не отправляют пустой userId

### Поездки / шаблоны
- `tripSwitcherOpen` в store — CTA с Обзора и Профиля открывают переключатель
- Обложка (emoji/цвет) сохраняется при создании с нуля
- Шаблон: сначала выбор + название, потом создать; честный счётчик мест
- Пустой список поездок очищает stale tripId

### Join / Login
- Join всегда по session user (не spoof body.userId)
- `?code=` сразу показывает preview; login с `callbackUrl` возвращает на invite
- Invite не строит QR с пустым кодом; код на Обзоре без обрезки

## v0.2.7 — Лента, Маршрут, Чат

### Лента
- Нет ложного «пусто» без активной поездки — empty + переход на главную
- Ошибка загрузки: retry через refetch (без reload страницы)
- Чипы фильтров ≥44px; клик по месту открывает день в Маршруте
- «Показать ещё» считает только отфильтрованные события; валюта из settings

### Маршрут
- `useDays` без `placeholderData: []` (нет ложного empty при загрузке)
- PlaceDialog: заметки не залипают, toast после успеха, фото по placeId + сжатие
- Нельзя добавить точку в (0,0); чипы дней ≥44px; статус места — toast после mutate

### Чат
- Нет ложного «нет сообщений» без поездки
- Удаление только своих сообщений (кнопка скрыта у чужих)
- Ошибки: refetch вместо `location.reload`

## v0.2.6 — Photos, dashboard, AI Docker, budget sheet

### Фото
- Сжатие на телефоне без OOM (max side 1280, JPEG, без сырого HEIC)
- Сервер: sharp → JPEG + отдельный thumb; галерея грузит thumb
- Понятные ошибки HEIC / памяти; upload показывает текст ошибки API

### Обзор
- Нет бесконечного скелетона без поездки / при ошибке — empty + retry

### AI в Docker
- `OPENAI_API_KEY` (опционально) → живая генерация
- Без ключа — черновик по данным поездки (не 502)

### Бюджет
- «Добавить трату» выезжает снизу как маршрут (`MobileBottomSheet`)

## v0.2.5 — De-China runtime defaults

Убраны runtime-хардкоды Китая как «мира по умолчанию». Шаблон «Китай» в `trip-templates` остаётся как один из вариантов.

- `layout` keywords нейтральные
- Prisma `Trip.destination` default → `Unknown`
- Create trip / switcher destination → `Unknown` (не China)
- Geocode User-Agent → `TripTrek/1.0`
- `CITIES` = все `KNOWN_CITIES` (не только 4 China)
- Itinerary / Map center через `resolveCityCoords` (без Guangzhou fallback)
- Map footer: Amap/Baidu только если поездка про Китай
- Budget chart цвета из дней поездки; валюта из settings
- Share card цвет из `coverColor`
- TransportMap строится из дней маршрута (не хардкод GZ→SZ→HK→Macau)

## v0.2.4 — Mobile UX pass C

### Chip rails
- Общий класс `.chip-rail`: snap + мягкий fade по краям
- Подключено: Фразы, Еда, Погода, Галерея, Лента, Обзор, Маршрут, Chill, Nearby, Дневник

### Hit targets ≥44px
- Confirm Да/Нет: `.btn-confirm-yes` / `.btn-confirm-no` в Чат, Еда, Инфо, Дневник, Галерея, удаление дня
- Trash/pin иконки крупнее (чат, еда, инфо)

### Валюта
- `currencySymbol()` в `src/lib/currencies.ts`
- Бюджет ExpenseRow + поиск expenses + Achievements/AI без хардкода `$`
- Settlement-строки визуально отделены (зелёный фон)

## v0.2.3 — Mobile UX (shell + карта + бюджет)

### Shell
- `viewport-fit=cover` + safe-area (header / FAB / footer / sheets)
- Шапка на телефоне: день/город видимы; Premium / Invite / Share / Тема → меню «⋯»
- Табы `min-h-11` + scroll-snap; FAB с home indicator
- Sticky: `sticky-under-shell`; инпуты 16px

### Карта / Бюджет
- Фильтры свёрнуты на телефоне; карта на `dvh`
- Delete/confirm ≥44px; поля бюджета крупнее
