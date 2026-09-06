# Gallery Viewer & Filters Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom Gallery lightbox with `yet-another-react-lightbox` so mobile gets swipe/pinch-zoom and metadata is always visible; add chip filters and a "На карте" button that focuses the trip map on the photo's place; preserve the existing two-step delete confirm and author/owner policy.

**Architecture:** Single lightbox library swap. New `PhotoLightbox` client component wraps `<Lightbox>` from YARL; takes a flat photo array + callbacks. New transient `mapFocusTarget` field on `useTripStore` lets Gallery hand off to `TripMap`'s existing `<FlyTo>` helper. Filters replace two `<select>` with chip rows in the same `chip-rail` container. No changes to upload, EXIF, realtime, or auth — those are separate audit items.

**Tech Stack:** Next.js 16, React 19, framer-motion 12, zustand 5, `yet-another-react-lightbox` (new dep), lucide-react, sonner, react-leaflet (existing).

## Global Constraints

- Library: `yet-another-react-lightbox` from npm; no plugins (Captions/Counter/Thumbnails are built-in defaults).
- All Gallery code stays `"use client"`.
- Russian UI copy throughout; preserve existing strings ("Галерея", "Пока нет фото", "Нет фото по фильтру", "Сбросить", "Удалить", "Отмена", "Не удалось загрузить галерею", "Обновить", "Мои поездки →", "Нет активной поездки").
- `mapFocusTarget` is **not** persisted (transient signal); `partialize` excludes it.
- Keep the existing two-step delete confirm and `canDeleteActive = canDeleteAny || photo.userId === currentUserId` rule.
- Touch targets ≥ 44px on toolbar buttons.
- No commit without explicit user ask.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/components/trip/gallery.tsx` | modify | Trip-scoped Gallery page; owns filters, lightbox state, photo grid, empty/error/loading states; renders `<PhotoLightbox />`. |
| `src/components/trip/photo-lightbox.tsx` | create | Wraps `<Lightbox>` from YARL; builds slides; renders toolbar buttons (Map, Delete, Close). |
| `src/lib/trip-store.ts` | modify | Add transient `mapFocusTarget` state and setter (excluded from `partialize`). |
| `src/components/trip/trip-map.tsx` | modify | Read `mapFocusTarget` from store, pass `center` to existing `<FlyTo>` helper inside `<MapContainer>`. Clear the target after consumption. |
| `package.json` | modify | Add `yet-another-react-lightbox`. |

---

## Task 1: Install YARL dependency

**Files:**
- Modify: `package.json` (via yarn)
- Lockfile: `yarn.lock`

- [ ] **Step 1: Install the package**

Run from repo root `D:\Projects\trip-trek`:

```bash
yarn add yet-another-react-lightbox
```

Expected: command exits 0; `package.json` adds a `yet-another-react-lightbox` entry under `dependencies`; `yarn.lock` updates.

- [ ] **Step 2: Verify import resolution**

Run:

```bash
node -e "console.log(require.resolve('yet-another-react-lightbox'))"
```

Expected: prints an absolute path under `node_modules/yet-another-react-lightbox/...`. Non-zero exit / `Cannot find module` = install failed.

- [ ] **Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "chore: add yet-another-react-lightbox dep"
```

---

## Task 2: Add transient `mapFocusTarget` to trip store

**Files:**
- Modify: `src/lib/trip-store.ts`

**Interfaces:**
- Consumes: existing `TripState` interface and `useTripStore` (zustand 5).
- Produces: new `mapFocusTarget: { lat: number; lng: number; placeId: string | null } | null` and `setMapFocusTarget` on the store.

- [ ] **Step 1: Add the field and setter to the interface**

In `src/lib/trip-store.ts`, inside `interface TripState` (currently around lines 22–39), append at the end:

```ts
  mapFocusTarget: { lat: number; lng: number; placeId: string | null } | null;
  setMapFocusTarget: (
    t: { lat: number; lng: number; placeId: string | null } | null,
  ) => void;
```

- [ ] **Step 2: Add defaults + setter in the store implementation**

In the same file, inside the create callback `(set) => ({ ... })` block (currently around lines 43–67), append at the end (before the closing `})`):

```ts
      mapFocusTarget: null,
      setMapFocusTarget: (t) => set({ mapFocusTarget: t }),
```

- [ ] **Step 3: Exclude from persistence**

In the same file, in the `partialize` callback (currently lines 70–78), make sure `mapFocusTarget` is **not** listed. The function should keep its current shape but explicitly not include `mapFocusTarget` or `setMapFocusTarget`:

```ts
    {
      name: "triptrek-store",
      partialize: (s) => ({
        activeTab: s.activeTab,
        currentUserId: s.currentUserId,
        selectedDay: s.selectedDay,
        currentTripId: s.currentTripId,
        mapCityFilter: s.mapCityFilter,
        mapOnlyUnvisited: s.mapOnlyUnvisited,
        mapOnlyChill: s.mapOnlyChill,
      }),
    }
```

(The above is the current code — leave as-is; just verify it does not include the new field.)

- [ ] **Step 4: Type-check**

Run:

```bash
yarn tsc --noEmit
```

Expected: no errors. If the new interface field is missing its setter, TypeScript will complain in consumers.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trip-store.ts
git commit -m "feat(store): add transient mapFocusTarget signal"
```

---

## Task 3: Wire `mapFocusTarget` into `TripMap`

**Files:**
- Modify: `src/components/trip/trip-map.tsx`

**Interfaces:**
- Consumes: `mapFocusTarget` + `setMapFocusTarget` from `useTripStore`; existing `<FlyTo center={...} />` helper (already used elsewhere in this file at line 371).
- Produces: when `mapFocusTarget` becomes non-null, the map flies to that center; the target is cleared after consumption so re-triggering with the same coords works.

- [ ] **Step 1: Read the store fields in `TripMap`**

In `src/components/trip/trip-map.tsx`, find the destructure inside `function TripMap()` (currently line 54):

```ts
  const { mapCityFilter, setMapCityFilter, mapOnlyUnvisited, setMapOnlyUnvisited, mapOnlyChill, setMapOnlyChill, setTripSwitcherOpen, setActiveTab } = useTripStore();
```

Replace with:

```ts
  const { mapCityFilter, setMapCityFilter, mapOnlyUnvisited, setMapOnlyUnvisited, mapOnlyChill, setMapOnlyChill, setTripSwitcherOpen, setActiveTab, mapFocusTarget, setMapFocusTarget } = useTripStore();
```

- [ ] **Step 2: Clear the target once it's consumed**

Right after the destructure line, add a small effect so the target is cleared after the map has had a tick to react:

```ts
  useEffect(() => {
    if (!mapFocusTarget) return;
    const t = setTimeout(() => setMapFocusTarget(null), 50);
    return () => clearTimeout(t);
  }, [mapFocusTarget, setMapFocusTarget]);
```

- [ ] **Step 3: Pass `center` to the existing `<FlyTo>` helper**

The existing `<FlyTo center={center} />` is rendered somewhere inside the `<MapContainer>` (line 371). Find that line and confirm it is inside the `<MapContainer>` JSX. Then change it to:

```tsx
          <FlyTo center={mapFocusTarget ?? center} />
```

Notes:
- `center` here is whatever the existing local `center` state is (used by the rest of the file). Do not rename it; just fall back to it when `mapFocusTarget` is `null`.
- If `<FlyTo>` is currently rendered with a different prop name (e.g. `coords`), inspect the JSX and pass the new field via the existing prop pattern — the helper's signature is `({ center }: { center: { lat: number; lng: number } })`, so it expects `center`.
- If `<FlyTo>` is currently not inside `<MapContainer>` (which would be a bug), do **not** move it as part of this task — flag it and stop.

- [ ] **Step 4: Type-check**

Run:

```bash
yarn tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual sanity check**

Run:

```bash
yarn dev
```

Then in browser console of the running app, execute:

```js
window.localStorage.setItem('triptrek-store', JSON.stringify({state:{},version:0}));
```

Just reload; this verifies the app still boots without a stale persistence shape (zustand will refill defaults). No-op expected.

Expected: dev server reloads cleanly, no runtime errors in the terminal or browser console.

- [ ] **Step 6: Commit**

```bash
git add src/components/trip/trip-map.tsx
git commit -m "feat(map): focus map on mapFocusTarget from store"
```

---

## Task 4: Create `PhotoLightbox` wrapper component

**Files:**
- Create: `src/components/trip/photo-lightbox.tsx`

**Interfaces:**
- Consumes: YARL `Lightbox` component, `lucide-react` icons (`MapPin`, `Trash2`, `X`), `cn` from `@/lib/utils`.
- Produces: a controlled YARL lightbox that:
  - Receives `photos`, `index`, `onIndexChange`, `open`, `onClose`.
  - Renders toolbar buttons: "На карте" (if photo has coords/placeId), "Удалить" with two-step confirm (if `canDelete(photo)`), built-in `"close"`.
  - Renders photo metadata (day, city, author, address) via the `description` slot.

- [ ] **Step 1: Scaffold the file**

Create `src/components/trip/photo-lightbox.tsx` with this initial content (everything below — full file):

```tsx
"use client";

import { Lightbox } from "yet-another-react-lightbox";
import { MapPin, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Photo } from "@/lib/types";

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

export function PhotoLightbox({
  open,
  index,
  photos,
  onIndexChange,
  onClose,
  onMapClick,
  onDelete,
  canDelete,
  pendingDelete,
}: PhotoLightboxProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const slides = photos.map((p) => ({
    src: p.url,
    alt: p.caption ?? "Фото",
    description: (
      <div className="space-y-1 text-left max-w-3xl">
        {p.caption && <div className="font-medium">{p.caption}</div>}
        <div className="flex items-center gap-3 text-xs opacity-80 flex-wrap">
          {p.day && <span>День {p.day.dayNumber}</span>}
          {p.day?.city && <span>{p.day.city}</span>}
          {p.user && <span>{p.user.name}</span>}
        </div>
        {p.address && <div className="text-xs opacity-70">{p.address}</div>}
      </div>
    ),
  }));

  const current = photos[index];
  const hasMapTarget =
    !!current && (!!current.placeId || (current.lat != null && current.lng != null));
  const showDelete = !!current && canDelete(current);

  const MapButton = (
    <button
      key="map"
      type="button"
      disabled={!hasMapTarget}
      onClick={(e) => {
        e.stopPropagation();
        if (current && hasMapTarget) onMapClick(current);
      }}
      className={cn(
        "yarl__button",
        "size-11 rounded-full grid place-items-center text-white",
        "bg-white/10 hover:bg-white/20 active:scale-90 transition-transform",
        !hasMapTarget && "opacity-30 pointer-events-none",
      )}
      aria-label="Открыть на карте"
      title="Открыть на карте"
    >
      <MapPin className="size-5" />
    </button>
  );

  const DeleteButton = !showDelete ? null : (
    <div key="delete" className="flex items-center gap-1">
      {confirmDeleteId === current!.id ? (
        <>
          <button
            type="button"
            disabled={pendingDelete}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(current!.id);
            }}
            className="yarl__button btn-confirm-yes"
          >
            {pendingDelete ? "…" : "Удалить"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDeleteId(null);
            }}
            className="yarl__button btn-confirm-no bg-white/15 text-white"
          >
            Отмена
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDeleteId(current!.id);
          }}
          className="yarl__button size-11 rounded-full grid place-items-center text-white bg-white/10 hover:bg-red-500/80 active:scale-90 transition-transform"
          aria-label="Удалить фото"
          title="Удалить фото"
        >
          <Trash2 className="size-5" />
        </button>
      )}
    </div>
  );

  return (
    <Lightbox
      open={open}
      index={index}
      on={{ click: () => setConfirmDeleteId(null) }}
      onIndexChange={onIndexChange}
      onClose={onClose}
      slides={slides}
      carousel={{ finite: false, preload: 1 }}
      controller={{ closeOnBackdropClick: true }}
      toolbar={{
        buttons: [MapButton, DeleteButton, "close"],
      }}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
yarn tsc --noEmit
```

Expected: no errors. The `yarl__button` class is YARL's own button class — used here so our custom buttons visually align with built-ins.

- [ ] **Step 3: Lint**

Run:

```bash
yarn lint
```

Expected: no new errors in the new file.

- [ ] **Step 4: Commit**

```bash
git add src/components/trip/photo-lightbox.tsx
git commit -m "feat(gallery): add PhotoLightbox wrapper over YARL"
```

---

## Task 5: Refactor `gallery.tsx` — drop the custom overlay, wire chips and `PhotoLightbox`

**Files:**
- Modify: `src/components/trip/gallery.tsx`

**Interfaces:**
- Consumes: existing exports (`usePhotos`, `useDeletePhoto`, `useTrip`, `useCurrentTripId`, `useTripStore`, `useAuth`); new `PhotoLightbox` from `@/components/trip/photo-lightbox`; new `mapFocusTarget` setter from `useTripStore`.
- Produces: `Gallery` component with chip filters (instead of two `<select>`), `<PhotoLightbox />` instead of the `AnimatePresence` overlay, no `useEffect` for keyboard/scroll-lock (YARL handles them), and an `onMapClick` that writes to the store.

- [ ] **Step 1: Replace the imports**

In `src/components/trip/gallery.tsx`, replace the top-of-file imports (currently lines 1–9):

```tsx
"use client";

import { usePhotos, useDeletePhoto, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Images, X, Trash2, MapPin, Calendar, User } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
```

with:

```tsx
"use client";

import { usePhotos, useDeletePhoto, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Images, MapPin } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { PhotoLightbox } from "./photo-lightbox";
import { cn } from "@/lib/utils";
```

(`X`, `Trash2`, `Calendar`, `User`, `AnimatePresence` are no longer used; `cn` is needed for chips.)

- [ ] **Step 2: Add store selectors and helpers**

Right after the existing `const { setTripSwitcherOpen } = useTripStore();` line (currently line 16), add:

```tsx
  const setActiveTab = useTripStore((s) => s.setActiveTab);
  const setMapFocusTarget = useTripStore((s) => s.setMapFocusTarget);
```

Then right after `const [confirmDelete, setConfirmDelete] = useState<string | null>(null);` (currently line 24), add:

```tsx
  const onMapClick = (photo: typeof photos extends (infer P)[] | undefined ? P : never) => {
    if (!photo || photo.lat == null || photo.lng == null) return;
    setMapFocusTarget({ lat: photo.lat, lng: photo.lng, placeId: photo.placeId });
    setActiveTab("map");
    setLightbox(null);
  };
```

Then replace the existing keyboard/scroll-lock `useEffect` (currently lines 35–48) with an effect that closes the lightbox if filters change while it's open:

```tsx
  useEffect(() => {
    if (lightbox === null) return;
    setLightbox(null);
  }, [filterDay, filterCity]);
```

(Don't depend on `lightbox` in deps — that would loop. The effect closes any open lightbox when the filters change.)

- [ ] **Step 3: Delete the now-unused `confirmDelete` state**

The lightbox handles its own two-step confirm internally now. Delete this line (currently line 24):

```tsx
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
```

- [ ] **Step 4: Update the `handleDelete` to drop `setConfirmDelete(null)`**

Replace the existing `handleDelete` (currently lines 111–120):

```tsx
  const handleDelete = (photoId: string) => {
    del.mutate(photoId, {
      onSuccess: () => {
        toast.success("Фото удалено");
        setLightbox(null);
        setConfirmDelete(null);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось удалить"),
    });
  };
```

with:

```tsx
  const handleDelete = (photoId: string) => {
    del.mutate(photoId, {
      onSuccess: () => {
        toast.success("Фото удалено");
        setLightbox(null);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Не удалось удалить"),
    });
  };
```

- [ ] **Step 5: Replace the `<select>` filter UI with chip rows**

Replace the filter block (currently lines 133–163 — the `<div className="chip-rail no-scrollbar gap-2">` containing two `<select>` and the reset button) with:

```tsx
      <div className="space-y-2">
        <div className="chip-rail no-scrollbar gap-1.5">
          <Chip active={filterCity === ""} onClick={() => setFilterCity("")}>Все города</Chip>
          {[...new Set(trip?.days.map((d) => d.cityKey) ?? [])].map((c) => (
            <Chip
              key={c}
              active={filterCity === c}
              onClick={() => setFilterCity(filterCity === c ? "" : c)}
            >
              {trip?.days.find((d) => d.cityKey === c)?.city ?? c}
            </Chip>
          ))}
        </div>
        <div className="chip-rail no-scrollbar gap-1.5">
          <Chip active={filterDay === ""} onClick={() => setFilterDay("")}>Все дни</Chip>
          {trip?.days.map((d) => (
            <Chip
              key={d.id}
              active={filterDay === String(d.dayNumber)}
              onClick={() => setFilterDay(filterDay === String(d.dayNumber) ? "" : String(d.dayNumber))}
            >
              День {d.dayNumber}
            </Chip>
          ))}
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setFilterDay(""); setFilterCity(""); }}
            className="text-xs text-primary font-medium px-3 min-h-11 active:scale-95 transition-transform"
          >
            Сбросить
          </button>
        )}
      </div>
```

- [ ] **Step 6: Add the `Chip` local component at the bottom of the file**

At the very bottom of `gallery.tsx` (after the `Gallery` function's closing brace, before `export`), add:

```tsx
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium min-h-11 active:scale-95 transition-transform whitespace-nowrap",
        active
          ? "bg-primary text-primary-foreground border border-primary"
          : "bg-card border border-border text-foreground",
      )}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 7: Drop `layoutId` and the hover-only metadata**

Replace the entire `<div className="masonry-grid">…</div>` block (currently lines 192–242) with:

```tsx
        <div className="masonry-grid">
          {filtered.map((photo, i) => {
            const uploader = photo.user;
            return (
              <motion.button
                key={photo.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setLightbox(i)}
                className="masonry-item relative rounded-xl overflow-hidden bg-muted block w-full"
              >
                <img
                  src={photo.thumbUrl || photo.url}
                  alt={photo.caption || "Фото"}
                  className="w-full block bg-muted min-h-[120px] object-cover"
                  loading="lazy"
                  onError={(e) => {
                    const el = e.currentTarget;
                    if (photo.url && el.src !== photo.url && !el.src.endsWith(photo.url)) {
                      el.src = photo.url;
                      return;
                    }
                    el.style.display = "none";
                    const fallback = el.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.hidden = false;
                  }}
                />
                <div hidden className="w-full min-h-[120px] grid place-items-center text-muted-foreground text-xs p-4">
                  Не удалось показать фото
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2 flex flex-col gap-0.5 pointer-events-none">
                  <div className="text-white text-[10px] flex items-center gap-1">
                    <MapPin className="size-2.5" /> День {photo.day?.dayNumber}
                  </div>
                  {photo.caption && (
                    <div className="text-white text-xs line-clamp-1">{photo.caption}</div>
                  )}
                </div>
                {uploader && (
                  <div
                    className="absolute top-1.5 right-1.5 size-6 rounded-full grid place-items-center text-[10px] border border-white/50"
                    style={{ background: uploader.color }}
                    title={uploader.name}
                  >
                    {uploader.emoji}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
```

Notes:
- Removed `layoutId` (incompatible with YARL).
- Removed `group` and `group-hover:` from the bottom overlay — metadata now always visible at the bottom of every thumbnail (mobile-friendly).

- [ ] **Step 8: Replace the `AnimatePresence` lightbox overlay with `<PhotoLightbox />`**

Replace the entire `AnimatePresence` block (currently lines 244–340) with:

```tsx
      <PhotoLightbox
        open={lightbox !== null}
        index={lightbox ?? 0}
        photos={filtered}
        onIndexChange={(i) => setLightbox(i)}
        onClose={() => setLightbox(null)}
        onMapClick={onMapClick}
        onDelete={handleDelete}
        canDelete={(p) => canDeleteAny || p.userId === currentUserId}
        pendingDelete={del.isPending}
      />
```

- [ ] **Step 9: Type-check**

Run:

```bash
yarn tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Lint**

Run:

```bash
yarn lint
```

Expected: no errors. `unused-vars` may complain about `MapPin` if it's no longer used in JSX (it still is — leave alone). If a name like `useEffect` is now unused, delete the import — but it's still used (filter-change effect).

- [ ] **Step 11: Build**

Run:

```bash
yarn build
```

Expected: build succeeds. Warnings about YARL being a client-only lib are acceptable.

- [ ] **Step 12: Commit**

```bash
git add src/components/trip/gallery.tsx
git commit -m "feat(gallery): chip filters + YARL lightbox + map handoff"
```

---

## Task 6: Manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Boot dev server**

Run:

```bash
yarn dev
```

Expected: starts on the configured port (likely 3000); no compile errors.

- [ ] **Step 2: Desktop smoke**

In the browser (desktop viewport):
1. Open a trip with photos. Navigate to the **Галерея** tab.
2. Verify chips render for cities and days; "Все города" / "Все дни" highlighted.
3. Click "День 1" chip — counter switches to "N из M", grid filters.
4. Click the active chip again — filter clears.
5. Click a thumbnail — lightbox opens. Toolbar shows Close, Delete (if author/owner), and MapPin (if coords).
6. Press `→` / `←` — slides advance. Press `Esc` — closes.
7. Click backdrop — closes.
8. Click MapPin — switches to **Карта** tab, map flies to the photo's coordinates.
9. Open lightbox again, click Trash, click "Удалить" — photo disappears, toast confirms.
10. Verify counter "N из M" updates live as filter changes.

- [ ] **Step 3: Mobile smoke (DevTools)**

Switch DevTools to mobile (e.g. iPhone 14, 390×844):
1. Repeat the thumbnail → lightbox flow.
2. Swipe right → previous photo, swipe left → next photo.
3. Pinch / double-tap → zoom.
4. Confirm metadata caption text remains readable at the bottom of each photo.
5. Tap toolbar buttons — each hit target is at least 44×44.

- [ ] **Step 4: Edge cases**

- Open lightbox → change chip filter → lightbox must close (no crash).
- Filter that produces zero photos → "Нет фото по фильтру" empty state with reset button.
- Trip with no photos at all → "Пока нет фото" empty state (unchanged).
- Trip with no `tripId` (no active trip) → "Нет активной поездки" CTA (unchanged).

- [ ] **Step 5: Build + lint final check**

Run:

```bash
yarn build && yarn lint
```

Expected: both succeed.

- [ ] **Step 6: Hand back to user for review**

Stop here. Do not commit unless explicitly asked. List anything observed during smoke that warrants a follow-up task (e.g. a real-world visual nit, a slow load, an SSR warning).

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-09-06-gallery-viewer-polish-design.md`):

| Spec item | Covered by |
|---|---|
| YARL install | Task 1 |
| `mapFocusTarget` transient store field + setter | Task 2 |
| `TripMap` reads target, flyTo, clears | Task 3 |
| `PhotoLightbox` wrapper with toolbar (Map, Delete, Close) + description metadata | Task 4 |
| Gallery rewires chips, drops custom overlay, `onMapClick` writes to store | Task 5 |
| Filter change closes open lightbox | Task 5 Step 2 |
| Two-step delete + author/owner rule preserved | Task 4 (button) + Task 5 Step 8 (callback wires `canDelete`) |
| Screenshot `MapPin` only if coords/placeId | Task 4 (`hasMapTarget`) |
| `thumbUrl || url` on grid + lazy load + error fallback | Task 5 Step 7 |
| Russian copy preserved | Task 5 (no string changes) |
| Empty/error/loading states unchanged | Not touched in any task |
| Out of scope (P0 audit) untouched | No edits to API/security/EXIF/realtime |
| Manual mobile + desktop verification | Task 6 |

No gaps.

**2. Placeholder scan:** no TBD/TODO. All steps have full code or exact commands.

**3. Type consistency:**
- `mapFocusTarget` shape: `{ lat: number; lng: number; placeId: string | null } | null` — consistent across Tasks 2/3/5.
- `PhotoLightbox` props — Task 4's interface matches Task 5's invocation.
- `canDelete` callback signature — Task 5 passes `(p) => canDeleteAny || p.userId === currentUserId`, matches Task 4's `(photo: Photo) => boolean`.
- `onDelete(photoId)` — Task 5 wraps with toast + close, matches Task 4's call.

OK.
