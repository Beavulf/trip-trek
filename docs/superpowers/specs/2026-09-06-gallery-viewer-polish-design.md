# Gallery Viewer & Filters Polish — Design Spec

**Date:** 2026-09-06
**Scope:** Улучшение просмотра фото, сетки и фильтров на вкладке «Галерея».
**Out of scope:** безопасность, EXIF, realtime (`photo:deleted`), upload, server-side миниатюры — отдельные тикеты из `docs/audit-gallery-galereya.md`.

---

## Goals

1. **Mobile:** свайп, пинч-зум, метаданные всегда видны, нормальные тач-таргеты.
2. **Desktop:** клавиатура, колесо-зум, кнопки.
3. **Связь с картой:** кнопка «На карте» переводит на вкладку «Карта» с фокусом на месте.
4. **Фильтры:** чипы вместо двух `<select>`.
5. **Счётчик:** «показано N из M» при активных фильтрах (логика уже есть, оставляем).

## Non-goals

- Не менять upload/EXIF/безопасность/realtime.
- Не генерить серверные миниатюры.
- Не делать группировку сетки по дням.
- Не подключать плагины YARL (Captions/Counter/Thumbnails/Fullscreen) — стандартных кнопок хватит.
- Не делать автоплей/слайдшоу.

---

## Архитектура

### Зависимости

```bash
yarn add yet-another-react-lightbox
```

≈70kb gzip + ~10kb CSS. Совместим с Next 15 (использует `react@18+`, SSR-friendly).

### Изменения файлов

| Файл | Что делаем |
|---|---|
| `src/components/trip/gallery.tsx` | Сетка + фильтры на чипах + состояние lightbox; рендер нового `<PhotoLightbox />`. Удалить самописный overlay и `useEffect` keyboard/scroll-lock. |
| `src/components/trip/photo-lightbox.tsx` *(новый)* | Клиентский компонент-обёртка над `<Lightbox>` от YARL. Строит слайды из массива фото, рендерит кастомные toolbar-кнопки. |
| `src/lib/trip-store.ts` | Добавить transient поле `mapFocusTarget: { lat: number; lng: number; placeId: string \| null } \| null` + сеттер. **НЕ** persistить. |
| `src/components/trip/trip-map.tsx` | В существующем компоненте: `useEffect` на `mapFocusTarget` → `map.flyTo` + (опционально) открыть попап места. Не persistится, чистится после использования. |

`src/app/page.tsx` — без изменений.

---

## PhotoLightbox (новый компонент)

`"use client"`, импортирует `Lightbox` из `yet-another-react-lightbox`.

### Props

```ts
interface PhotoLightboxProps {
  open: boolean;
  index: number;
  photos: Photo[];
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onMapClick: (photo: Photo) => void;
  onDelete: (photoId: string) => void;
  canDelete: (photo: Photo) => boolean;
  pendingDelete: boolean;
}
```

### Поведение

- `slides`: `photos.map(p => ({ src: p.url, width, height, alt: p.caption ?? "Фото", description: <метаданные>, customData: p }))`.
- `<Lightbox open onClose onIndexChange={...} index slides carousel={{ finite: false, preload: 1 }} controller={{ closeOnBackdropClick: true }} toolbar={{ buttons: [<MapButton/>, <DeleteButton/>, "close"] }} />`.
- `index` — двусторонний binding, чтобы gallery мог сбросить на 0 при удалении.

### Кастомные кнопки

**MapButton** — `lucide-react` `MapPin`:
- Видна если `customData.placeId || (customData.lat && customData.lng)`.
- `onClick`: `onMapClick(photo)`.
- Tooltip: «Открыть на карте».

**DeleteButton** — `lucide-react` `Trash2`:
- Двухшаговый confirm внутри кнопки:
  - Первый клик → `Trash2`.
  - Второй клик → две маленькие кнопки «Удалить» / «Отмена».
- Видна если `canDelete(photo)`.
- Disabled если `pendingDelete`.

### Метаданные (description)

Используем встроенный Captions от YARL. Передаём через `description` кастомный ReactNode:

```jsx
description={
  <div className="space-y-1">
    {photo.caption && <div className="font-medium">{photo.caption}</div>}
    <div className="flex items-center gap-3 text-xs opacity-80 flex-wrap">
      <span>День {photo.day?.dayNumber}</span>
      <span>{photo.day?.city}</span>
      {photo.user && <span>{photo.user.name}</span>}
    </div>
    {photo.address && <div className="text-xs opacity-70">{photo.address}</div>}
  </div>
}
```

Если встроенные Captions визуально не подойдут к нашему стилю — fallback через `render.slideFooter` (на этом этапе не делаем, проверим визуально).

---

## Сетка и фильтры (правки в `gallery.tsx`)

### Чипы

Заменяем два `<select>` на группы чипов:

- Контейнер: `flex flex-col gap-2` (две группы: города и дни).
- Каждая группа: `<div className="chip-rail no-scrollbar gap-1.5">` с горизонтальным скроллом.
- Чип «Все города» / «Все дни» — активный по умолчанию.
- Активный чип: `bg-primary text-primary-foreground border-primary`.
- Неактивный: `bg-card border border-border`.
- Клик по активному чипу в группе — снимает фильтр (как `setFilterCity("")`).
- Кнопка «Сбросить» появляется при `hasFilters`.

### Счётчик

Логика уже корректная (`filtered.length из photos.length` при `hasFilters`, иначе `photos.length`). Оставляем текст и расположение.

### Сетка

- Без изменений разметки (`.masonry-grid` / `.masonry-item`).
- Убираем `layoutId` с `motion.button` (несовместим с YARL).
- `initial={{ opacity: 0 }} animate={{ opacity: 1 }}` — простой fade.
- Сохраняем `thumbUrl || url`, ленивую загрузку и обработку ошибок.

---

## Store: `mapFocusTarget`

Добавляем в `useTripStore`:

```ts
mapFocusTarget: { lat: number; lng: number; placeId: string | null } | null;
setMapFocusTarget: (t: { lat: number; lng: number; placeId: string | null } | null) => void;
```

**Не** включаем в `partialize` — transient signal.

### Использование

**Gallery:**
```ts
const setMapFocusTarget = useTripStore(s => s.setMapFocusTarget);
const setActiveTab = useTripStore(s => s.setActiveTab);
const onMapClick = (photo: Photo) => {
  if (photo.lat == null || photo.lng == null) return;
  setMapFocusTarget({ lat: photo.lat, lng: photo.lng, placeId: photo.placeId });
  setActiveTab("map");
  setLightbox(null);
};
```

**TripMap (`trip-map.tsx`):**
```ts
const mapFocusTarget = useTripStore(s => s.mapFocusTarget);
const setMapFocusTarget = useTripStore(s => s.setMapFocusTarget);
useEffect(() => {
  if (!mapFocusTarget || !mapRef.current) return;
  mapRef.current.flyTo([mapFocusTarget.lat, mapFocusTarget.lng], 13, { duration: 0.8 });
  // опционально: открыть попап места через существующий стейт
  setMapFocusTarget(null);
}, [mapFocusTarget]);
```

---

## Edge cases

| Случай | Поведение |
|---|---|
| Сменили фильтр при открытом lightbox | `useEffect([filterDay, filterCity])` → `setLightbox(null)`. Индекс по `filtered` мог устареть. |
| Удалили фото | `del.mutate` → `onSuccess` → `setLightbox(null)`, `setConfirmDelete(null)`. Список `filtered` обновится через React Query. |
| Нет `tripId` | Старый empty Обзора с CTA «Мои поездки». Без изменений. |
| `tripError / isError` | Старый error state с кнопкой «Обновить». Без изменений. |
| `isLoading / tripLoading` | Старый skeleton. Без изменений. |
| `filtered.length === 0` с активным фильтром | «Нет фото по фильтру» + кнопка сброса. Без изменений. |
| Realtime `photo:deleted` | Вне скоупа. Если сделают отдельно — `photos` обновится через React Query, lightbox закроется, если нужно — пользователь переоткроет. |
| SSR | YARL — клиентская либа. `gallery.tsx` уже `"use client"`, `<PhotoLightbox />` тоже `"use client"`. Дополнительных dynamic-import не требуем. |

---

## Тестирование

Ручное на мобильном (DevTools mobile view, 390×844):
- Свайп влево/вправо между фото.
- Пинч-зум двумя пальцами.
- Двойной тап — toggle zoom.
- Метаданные видны всегда, не только на hover.
- Кнопки toolbar попадают в тач-таргет ≥44px.

Ручное на десктопе:
- Стрелки клавиатуры, Esc, колесо-зум, fullscreen.
- Клик по подложке закрывает.

Функциональные:
- Чип-фильтры корректно сужают сетку, счётчик «N из M».
- «Сбросить» снимает оба фильтра.
- Кнопка «На карте» → вкладка `map` открыта, карта спозиционирована на точку.
- Кнопка «Удалить» сохраняет двухшаговый confirm.
- Смена фильтра при открытом lightbox закрывает его.
- Сборка: `yarn build` без ошибок, бандл не растёт больше ~80kb.

---

## Определение «готово»

- [ ] YARL подключён, lightbox работает свайпом/зумом/клавиатурой.
- [ ] Метаданные видны на мобильном без hover.
- [ ] Кнопка «На карте» переключает вкладку и центрирует карту на месте/координатах фото.
- [ ] Кнопка «Удалить» с двухшаговым confirm; политика автора/owner сохранена.
- [ ] Фильтры — чипы; активный виден; сброс работает.
- [ ] Счётчик «N из M» при активном фильтре.
- [ ] Сборка и dev-server без ошибок и предупреждений о SSR.
- [ ] Существующие empty/error/loading состояния не сломаны.
- [ ] Вне скоупа (P0 аудита) не тронуты.
