# TripTrek — бриф: Галерея (Gallery)

> Для ИИ-агента: **только Галерею**. Mobile-first. Мультипользовательская поездка. Валюта N/A — не трогать. Русский UI.

**Файлы:**
- UI: `src/components/trip/gallery.tsx`
- Upload: `src/components/trip/quick-add.tsx` (`PhotoForm`)
- Вкладка: `src/app/page.tsx` (`gallery`), `app-shell.tsx`
- Хуки: `usePhotos`, `useUploadPhoto`, `useDeletePhoto`, `getTripId` — `src/hooks/use-trip.ts`
- API: `src/app/api/photos/route.ts`, `src/app/api/photos/geo/route.ts`
- Realtime: `use-websocket.ts`, `ws-emit.ts`, `server/notification-map.ts`
- Смежно: upload с места без userId — `itinerary.tsx` `PlaceDialog.onFile`
- Типы: `src/lib/types.ts` (`Photo`), `prisma/schema.prisma`

**Смысл:** masonry фото поездки + lightbox; `+` Quick Add; EXIF/geo → карта; авторы участников.

---

## P0 — безопасность / realtime / empty

### 1. `GET /api/photos` без tripId → все фото БД
- Пустой `getTripId()` → `?tripId=` → `where={}` → чужие фото.
- Нет `enabled: !!tripId` на хуке.
- **Где:** `api/photos/route.ts` GET; `usePhotos`.
- **Нужно:** обязательный tripId + membership; `enabled: !!tripId`.

### 2. `GET /api/photos/geo` без tripId → все geo-фото
- **Где:** `api/photos/geo/route.ts`; `trip-map.tsx`.
- **Нужно:** то же.

### 3. DELETE эмитит `photo:added`
- Toast/push «добавил фото»; отдельного `photo:deleted` нет.
- **Где:** `api/photos/route.ts` DELETE; `notification-map.ts`; `use-websocket.ts`.
- **Нужно:** `photo:deleted` + invalidate; не слать `photo:added` на delete.

### 4. Нет auth / ownership на DELETE; файл в `public/uploads` остаётся
- **Нужно:** membership; удалять только автор/owner; `unlink` файла.

### 5. Empty trip → ложный «Пока нет фото»
- **Нужно:** empty как Обзор (нет поездки + CTA); error + retry.
- **Где:** `gallery.tsx`.

---

## P1 — UX / EXIF / авторы / lightbox

### 6. Delete: toast success до ответа; нет confirm; нет pending
- Любой видит trash на чужом фото.
- **Где:** `gallery.tsx`; `useDeletePhoto` без `r.ok`.

### 7. EXIF GPS ок, `takenAt` из EXIF не уходит на сервер
- POST всегда `takenAt: new Date()`.
- HEIC в allowlist, Canvas на iOS часто ломает.
- **Где:** `quick-add.tsx` PhotoForm; `api/photos` POST.

### 8. Upload без / с пустым userId → фото без автора
- Quick Add: session или пустой `currentUserId`.
- Itinerary PlaceDialog: **без** userId.
- **Нужно:** userId из сессии на сервере; itinerary тоже.

### 9. Lightbox mobile слабый
- Нет swipe / Escape / body scroll lock; мелкие стрелки; индекс по `filtered` ломается при фильтрах.
- Hover-мета на сетке не работает на таче.
- **Нужно:** swipe+Escape+scroll-lock; ключ `photoId`; мета всегда видна на mobile.

### 10. Empty при фильтрах = тот же «нет фото»
- **Нужно:** «нет по фильтру» + сброс.

### 11. PhotoForm `dayId` может остаться `""` при позднем trip
- **Где:** `quick-add.tsx` — sync useEffect.

### 12. `thumbUrl === url` — сетка грузит full-res
- **Нужно:** реальный thumb; `src={thumbUrl || url}`.

### 13. Авторы: нет фильтра «мои»; на mobile автор слабо виден
### 14. После фикса delete — подписать `photo:deleted` в WS
### 15. Лимит 25MB клиент vs 20MB API → ложный fail
- Выровнять + текст ошибки с API.

---

## P2

### 16. Мёртвый `Loader2` в gallery
### 17. Счётчик = filtered — подписать «показано / всего»
### 18. a11y alt / focus trap
### 19. Orphan files в uploads
### 20. Чипы день/город вместо двух select
### 21. Lightbox не показывает связанное `place` (хотя API include есть)

---

## Definition of Done

- [ ] Нет tripId → empty Обзора, не чужие фото
- [ ] photos + photos/geo требуют tripId + membership; hooks enabled
- [ ] DELETE → `photo:deleted`; нет toast «добавил»
- [ ] Delete: confirm + toast по факту + pending; политика автора
- [ ] Upload: userId из сессии; EXIF takenAt; geo на карте
- [ ] Lightbox mobile: swipe/Escape/scroll-lock; meta без hover
- [ ] Empty фильтра ≠ empty галереи; thumbs; смена поездки без stale
- [ ] Валюта не трогалась

## Чего не делать

- Не «чинить» delete через `photo:added`.
- Не открывать API без auth.
- Не redesign всего приложения / не трогать Budget.
- Не коммитить без просьбы.
