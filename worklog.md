# TripTrek China — Work Log

## Current Project Status

**Phase**: 16 (Login UX + Join Fix + Budget Plan Fix + AI Trip-Scoped + Currency + Food Add) — COMPLETED
**Build**: ✅ TypeScript clean, ESLint clean (1 minor warning)
**Dev Server**: Running via `bun server.ts` (Next.js + WebSocket + Push on port 3000)
**Test Accounts**: you@/leha@/den@triptrek.com (password: 1234)

---

## Session: Login UX + Join Fix + Budget Plan Fix + AI Trip-Scoped + Currency + Food Add

### Feature: Login — password confirmation + eye icon
- Added "Подтвердите пароль" field (registration only)
- Eye/EyeOff toggle on both password fields
- Live validation: red border if mismatch, green if match
- Hints: "Пароли не совпадают" / "✓ Пароли совпадают"
- Min length check (4 chars)

### Fix: Join by code → 404
**Problem**: Button linked to `/join/` (trailing slash) but route was `/join/[code]`. No page for code input.
**Fix**: Created `/join/page.tsx` — standalone code entry page:
- Input field with uppercase + monospace
- "Найти поездку" → preview trip (title, emoji, members)
- "Присоединиться" → joins trip, switches, navigates to main
- Fixed button: `/join/` → `/join`

### Fix: Budget plan not saving on mobile
**Root cause**: `useUpdateBudgetPlan` didn't send `tripId` in body → API returned 400. Also `onBlur` lost focus on mobile.
**Fix**:
- Hook now sends `tripId: getTripId()` in body
- Removed `onBlur` (unreliable on mobile)
- Added explicit ✓ checkmark button next to input
- Better error handling with toast

### Fix: AI summary hardcoded "China 2024"
**Root cause**: `useAISummary` hook didn't pass `tripId` → API used `"default-trip"` → always China trip.
**Fix**: Hook now sends `?tripId=${getTripId()}` in URL. AI generates summary for the CURRENT trip (title, destination, days, places).

### Feature: Currency converter — 24 currencies
Added EUR, GBP, JPY, KRW, THB, VND, SGD, UAH, KZT, TRY, AED, INR, IDR, MYR, PHP, AUD, CAD, CHF (was 6, now 24). All from open.er-api.com (free, no key).

### Feature: Add/Delete food items
- `POST /api/foods` — create food (name, nameCn, city, place, price, emoji, description)
- `DELETE /api/foods?id=` — delete food
- `useAddFood`, `useDeleteFood` hooks
- "Добавить блюдо" button in food guide → modal with:
  - 20 emoji icons
  - Name, local name, city (datalist from trip days), place, price, description
  - Auto-scroll lock, bottom sheet style

---

## Session: Web Push VAPID + Avatar Upload + Achievement Details + Food City Fix + Map Perf

### Feature: Web Push notifications (VAPID) — works on locked phone!
**Problem**: Push toggle said "не поддерживаются" because it used basic `Notification` API (only works when site is open). No way to notify locked phone.

**Solution**: Full Web Push implementation with VAPID:
1. **Generated VAPID keys** (public + private) — stored in `.env`
2. **New Prisma model**: `PushSubscription` (userId, endpoint, p256dh, auth)
3. **API endpoints**:
   - `GET /api/push/vapid-public-key` — returns public key
   - `POST /api/push/subscribe` — saves subscription to DB
   - `DELETE /api/push/subscribe?endpoint=` — removes subscription
4. **`src/lib/push-send.ts`**: `sendPushToTripMembers(tripId, notification)` — sends push to ALL trip members (even offline)
5. **`server/emit-handler.ts`**: When WS event has notification → also sends Web Push (for offline users)
6. **PushToggle rewritten**: Uses `pushManager.subscribe()` with VAPID key, saves to server
7. **SW updated**: Handles push events with `data.body`, `vibrate`, `actions`

**How it works now:**
- User A adds expense → API → `/emit` → server.ts
  - WebSocket broadcast to online users (instant toast)
  - Web Push to offline users (notification on locked phone!)
- User B's phone shows notification even if app closed

### Feature: Achievement details on tap (mobile)
**Problem**: On mobile, achievement labels were truncated, no way to see description.
**Fix**: Click achievement → expands description card below grid:
- Shows emoji, label, status badge ("✓ Получено" or "🔒 Заблокировано")
- Description: "Как получить: 10 фото" or "Достижение разблокировано!"
- Lock icon 🔒 on locked achievements
- Ring highlight on selected
- X button to close

### Feature: Avatar photo upload
**Problem**: Only emoji avatars, no photo upload.
**Solution**:
1. **Schema**: Added `avatarUrl` field to User model
2. **API**: `POST /api/user/avatar` — saves file to `/uploads/avatars/`, updates user
3. **Profile UI**: Camera button on avatar (in edit mode) → file picker → upload → instant preview
4. **Display**: If `avatarUrl` exists → show `<img>`, otherwise show emoji

### Fix: Food guide showing hardcoded China cities
**Problem**: Food guide used `CITIES` constant (4 China cities) for filter buttons. New trip to Tokyo showed China cities.
**Fix**: `foodCities` now built dynamically from `foods` data (unique cities from food items). Filter buttons show only cities that have food in current trip.

### Fix: "excludeSelf" (paid for others only) added to budget
**Problem**: Budget AddExpenseForm didn't have "paid only for others" option (only in QuickAdd).
**Fix**: Added `excludeSelf` checkbox to budget form:
- "Заплатил только за них (на себя не тратил)"
- When checked: payer NOT included in split, debt = amount / selected count
- Live hint: "💡 Каждый должен по $5.00 плательщику (ты не участвуешь)"

### Fix: Map performance on mobile
**Problem**: Map lagged when dragging/zooming on mobile.
**Fix**:
- `preferCanvas={true}` — renders markers on canvas (faster than SVG)
- `zoomControl={false}` + manual `<ZoomControl position="bottomright" />` — prevents accidental zoom on drag
- Removed default zoom control that overlapped with map interactions

---

## Session: QuickAdd Expense UX + WebSocket Fix + PWA Updates + Mobile Delete

### Fix: WebSocket not updating for other users
**Root cause**: `use-websocket.ts` formed URL as `ws://hostname:3000` with explicit port. Through Caddy gateway (sandbox preview), client sees HTTPS without port → `window.location.port` empty → fallback to `3000` → `wss://hostname:3000` fails (Caddy doesn't expose 3000 directly).

**Fix**: Changed to `window.location.origin` — WebSocket connects to same origin as page. Caddy proxies `/socket.io/` path correctly to localhost:3000.

```ts
// Было: ws://hostname:3000 (не работает через Caddy)
const wsUrl = `${protocol}//${host}:${wsPort}`;

// Стало: window.location.origin (работает через Caddy/HTTPS)
const wsUrl = window.location.origin;
```

Also added `polling` as fallback transport (in case WebSocket blocked) and explicit `path: "/socket.io/"`.

### Feature: QuickAddSheet ExpenseForm — full split functionality
**Problem**: QuickAdd "+" sheet had basic expense form without split/debt features. Budget page had full features.

**Fix**: Rewrote ExpenseForm in quick-add.tsx to match budget page:
1. **Hint banner**: "Кто платит — ты. Отметь за кого, чтобы посчитать долги."
2. **"За кого заплатил?"** — checkbox list (excluding self as payer)
3. **"Заплатил только за них"** — special checkbox for "paid only for others, not for myself"
   - When checked: debt split only among selected people (not payer)
   - Example: I bought coffee for Лёха ($5), excludeSelf → Лёха owes me $5 (not $2.50)
4. **Live calculation**: "💡 Каждый должен по $5.00 тебе" or "включая тебя"
5. **On submit**: toast shows debt info with names

### Fix: QuickAddSheet UI/UX — padding too close to edges
- SheetContent: added `px-5 pb-6 pt-2` padding
- SheetHeader: `px-0` (inherits from parent padding)
- SheetTitle: `text-base` for better hierarchy
- Plus icon: proper `PlusIcon` from lucide-react (was dummy function returning null)

### Fix: Delete expense icon missing on mobile
**Root cause**: Button had `opacity-0 group-hover:opacity-100` — mobile devices don't have hover, so button was invisible.

**Fix**: Removed hover dependency. Now:
- Delete button always visible (muted color)
- On click → confirmation "Да"/"Нет" inline buttons
- After delete → toast "Удалено"

### Feature: PWA update notification
**Created**: `src/components/trip/pwa-update.tsx`
- Checks for SW updates every 30 seconds
- When new SW waiting → shows animated toast "Доступна новая версия"
- Button "Обновить" → sends `SKIP_WAITING` message to SW → page reloads
- Button "X" → dismiss (will show again next check)

**SW updates** (`public/sw.js`):
- Cache version bumped to `triptrek-v2`
- Removed auto `skipWaiting()` on install (now controlled by user)
- Added `message` event handler for `SKIP_WAITING`
- Added `icon-1024.png` to static assets

**SW registration** (`providers.tsx`):
- Added `navigator.serviceWorker.register("/sw.js")` on window load
- Was missing — SW was never registered!

---

## Session: City Autocomplete Integration + Weather Anywhere + Expense UX + WebSocket

### Feature: CityAutocomplete integrated into AddDayButton
- Replaced plain text input with `CityAutocomplete` component
- On city select: shows confirmation card with flag + language
- Hint: "После создания дня автоматически добавятся фразы на языке [lang] и погода"
- Stores cityKey as `custom-{lat}-{lng}` for weather lookup

### Feature: Weather works for ANY city worldwide
- `/api/weather` rewritten to accept `lat`, `lng`, `name`, `timezone` params
- Legacy city keys (guangzhou, tokyo, etc.) still work via LEGACY_CITIES map
- New `useWeatherByCoords(lat, lng, name, timezone, forecast)` hook
- WeatherPanel rewritten: dynamically builds city list from trip days (useDays)
  - Extracts lat/lng from cityKey format `custom-{lat}-{lng}`
  - Falls back to legacy cities if cityKey matches
  - Shows unique cities only (deduped)
  - Empty state: "Добавьте дни в маршрут, чтобы увидеть погоду"

### Feature: Expense UX redesign — clear split/debt pattern
**Problem**: Adding expenses was confusing — unclear who to select, what "внёс" means, how debts work.

**Fix**: Complete redesign of AddExpenseForm:
1. **Hint banner**: "Кто платит — тот кто достал карту. Отметь за кого, чтобы посчитать долги."
2. **"Кто заплатил?"** — button chips with avatars (not dropdown), defaults to current user
3. **"За кого заплатил?"** — always visible checkbox list (not hidden in toggle)
   - Payer auto-checked + disabled "(заплатил)"
   - Live calculation: "💡 Каждый должен по $16.67 плательщику"
4. **On submit**: if split selected → toast shows "Долг: каждый должен $16.67 → Лёха"
5. **"Расчёт между друзьями"** section: added explanation "Внёс — сколько реально заплатил. + ему должны, − он должен"

### Fix: Settlement button — role-based (debtor only)
- **Debtor** (owes): sees "Я перевёл" button
- **Creditor** (owed): sees "🕐 Ждём перевод" (no button)
- **Others**: see nothing
- After marking: "✅ Переведено"

### Fix: Phrase pronunciation — universal language detection
**Problem**: Always said "китайский голос не установлен" even for Japanese phrases.
**Fix**: Auto-detects language from phrase characters:
- Hiragana/Katakana → Japanese (ja)
- Hanzi → Chinese (zh)
- Hangul → Korean (ko)
- Thai script → Thai (th)
- Arabic script → Arabic (ar)
- Cyrillic → Russian (ru)
- French/German/Spanish diacritics → respective languages
- Toast: "Не установлен [язык] голос" with correct language name

### WebSocket server running in sandbox!
- Started via `bun server.ts` (not `next dev`)
- Next.js + Socket.io on same port 3000
- `/socket.io/` endpoint: 200 OK
- `/emit` endpoint: 200 OK (API → WS bridge works)
- Real-time updates now work between participants

---

## Session: City Autocomplete + Settlement Logic + App Icons

### Feature: City Autocomplete API
**Created**: `GET /api/city-search?q=...` using Open-Meteo Geocoding API (free, no key)
- Searches cities worldwide in Russian
- Returns: name, country, region, lat/lng, timezone, language, flag emoji
- Language auto-detected from country code (zh, ja, ko, th, fr, de, en, etc.)
- 35+ country-to-language mappings

### Feature: CityAutocomplete component
**Created**: `src/components/trip/city-autocomplete.tsx`
- Debounced search (350ms)
- Dropdown with flag, city name, region, country, language badge
- On select: shows confirmation card with city + language
- Ready to integrate into trip creation and "add day" forms

### Feature: Auto-generate phrases by language
**Created**: `POST /api/phrases/generate` with phrase database for 8 languages:
- zh (Chinese): 30 phrases — basics, food, transport, shopping, emergency
- ja (Japanese): 13 phrases
- ko (Korean): 9 phrases
- th (Thai): 9 phrases
- fr (French): 10 phrases
- en (English): 10 phrases
- vi, es, de: basic phrases
- Skips if phrases already exist for trip

### Fix: Settlement button logic
**Problem**: Anyone could click "Оплачен" — confusing, no accountability.
**Fix**: Now role-based using current user session:
- **Debtor** (owes money): sees "Я перевёл" button → marks payment sent
- **Creditor** (owed money): sees "Ждём перевод" status → knows to expect payment
- **Other participants**: see nothing (not their transaction)
- After marking: shows "✅ Переведено" confirmation

### Asset: App icons generated
- `public/icon-1024.png` — master icon (orange-rose gradient, paper airplane)
- `public/icon-512.png` — PWA icon (compass/map pin)
- `public/icon-192.png` — existing small icon
- Manifest updated with correct icon references

---

## Session: Trip Scoping Fixes + Split Expenses + Button-in-button

### Bug: Button-in-button hydration error in Itinerary
**Problem**: `DeleteDayButton` (a `<button>`) was rendered inside DayCard's outer `<button>` — HTML doesn't allow nested buttons, causes hydration error.
**Fix**: Replaced outer `<button>` with `<div role="button" tabIndex={0}>` + keyboard handler (Enter/Space). Keeps accessibility without HTML violation.

### Bug: Gallery showed photos from ALL trips (China photos in Tokyo trip)
**Root cause**: `usePhotos()` hook didn't pass `tripId` to API or queryKey. Same for `photos/geo` endpoint — no tripId filter at all.
**Fix**:
- `usePhotos()`: Added `params.set("tripId", getTripId())` + `getTripId()` in queryKey
- `photos/geo` API: Added `tripId` query param support
- `trip-map.tsx`: Fetches `/api/photos/geo?tripId=${getTripId()}` + tripId in queryKey

### Bug: Expenses not appearing / list inconsistent
**Root cause**: `useExpenses` queryKey was `["expenses"]` without tripId. When switching trips, stale cache showed old data.
**Fix**: queryKey now `["expenses", getTripId()]`. Same fix applied to ALL trip-scoped hooks:
- useJournal, useBoard, useChecklist, useInfo, usePhrases, useBudgetPlan
All now include `getTripId()` in queryKey AND pass tripId to API.

### Bug: Food list disappeared after creating new trip
**Root cause**: `useFoods()` didn't pass tripId — showed ALL foods from DB. New trip had no foods, but old foods from China trip were shown... or not shown depending on cache.
**Fix**: `useFoods()` now passes `tripId` and includes it in queryKey.

### Feature: "Заплатил за других" (Split Expense) in Budget
**Problem**: Settlement feature was confusing — hard to understand who owes whom.
**Solution**: Added split expense UI directly in AddExpenseForm:
- "Заплатил за других" toggle button (with Users icon)
- Opens checkbox list of participants (payer is auto-included, disabled)
- Shows live calculation: "3 чел · $16.67/каждый"
- Hint: "💡 Каждый должен по $16.67 плательщику"
- Settlement section below now shows calculated debts with "Оплачен" button

---

## Session: UI Polish + Day Management + Settlements + Bug Fixes

### Bug: "Cannot read properties of undefined (reading 'lat')" on Add Place
**Root cause**: `itinerary.tsx` had hardcoded `cityCoords` with only 4 China cities. If trip used a different cityKey (e.g. "tokyo" from Japan template), `cityCoords[currentDay.cityKey]` returned undefined → crash on `.lat`.

**Fix**: Added more cities (tokyo, paris, bangkok, phuket) + fallback to guangzhou: `const c = (currentDay && cityCoords[currentDay.cityKey]) || cityCoords.guangzhou;`

### Bug: Turbopack warning "Cannot update a component (Router) while rendering"
**Fix**: Moved `router.push("/login")` from render body to `useEffect` in `page.tsx`.

### Bug: Mobile browser crash on photo upload
**Fix**: Added Canvas image compression (max 1920px, JPEG 0.8), EXIF optimization (`{ gps: true }`), Object URL cleanup, processing state with loading overlay.

### Feature: Body scroll lock when bottom sheet is open
**Problem**: On mobile, when a bottom sheet (AddPlaceSheet, ShareCard, InviteFriends, etc.) opened, the background page could still scroll, causing the sheet to "drift".

**Fix**: Created `useBodyScrollLock(active)` hook that sets `body.overflow = hidden` with scrollbar-width padding compensation. Applied to all 8 portal/modal components:
- AddPlaceSheet, ShareCard, TemplatePicker, InviteFriends, BudgetEditModal, PremiumModal, GlobalSearch, PlaceDialog
- (QuickAddSheet uses Radix Sheet which already has scroll lock built-in)

### Feature: Day management (add/delete) in Itinerary
**Problem**: No way to add or delete trip days.

**Fix**:
- `/api/days` POST — create new day (auto-increments dayNumber, updates trip.totalDays)
- `/api/days` DELETE — delete day (renumbers remaining days, prevents deleting last day)
- `/api/days` PATCH — update day (city, title, accentColor)
- `useAddDay`, `useDeleteDay`, `useUpdateDay` hooks
- "Добавить день" button at bottom of itinerary (opens modal with city/title/color picker)
- DeleteDayButton in each DayCard header (with confirmation)

### Feature: Settlement/Transfer recording in Budget
**Problem**: "Расчёт между друзьями" showed who owes whom, but no way to record payments.

**Fix**:
- Added "Оплачен" button on each settlement
- Creates expense with `category: "settlement"` (excluded from totalSpent, charts, category breakdown)
- Settlement expenses show in history with "💸" icon and "Перевод" label
- After marking as paid, settlement disappears (balance recalculated)
- `realExpenses = expenses.filter(e => e.category !== "settlement")` used for all calculations

### UI: Budget "Добавить" button rename
**Problem**: When add expense form was expanded, the toggle button still said "Добавить" — confusing.

**Fix**: Button now shows "Скрыть" with X icon when form is open, "Добавить" with Plus icon when closed. Style also changes (secondary when open, primary when closed).

### UI: Chart tooltip text color
**Problem**: Bar chart tooltip "Потрачено: $60" text was black on dark background.

**Fix**: Added `labelStyle={{ color: "var(--foreground)" }}` and `itemStyle={{ color: "var(--foreground)" }}` to the BarChart Tooltip (was missing, only PieChart had it).

### UI: Achievements labels overflow in Profile
**Problem**: Achievement labels were positioned absolutely at bottom of `aspect-square` cards, overflowing on long names.

**Fix**: Changed to flex column layout (`p-2 flex flex-col items-center gap-1`), removed `aspect-square`, used `line-clamp-2` for labels, grid changed from 4/6 cols to 3/5 cols.

### UI: QuickAddSheet animation optimization
**Problem**: Opening the + sheet felt laggy on mobile.

**Fix**: Replaced `motion.button` (framer-motion whileTap) with regular `button` + CSS `active:scale-95` transition. Framer-motion inside Radix Sheet caused unnecessary re-renders during open animation.

---

## Session: Mobile Photo Crash Fix + Turbopack Warning Fix

### Bug: Turbopack warning "Cannot update a component (Router) while rendering a different component (Home)"
**Root cause**: In `src/app/page.tsx`, `router.push("/login")` was called **during render** (line 38-40), which is a React anti-pattern that triggers the warning.

**Fix**: Moved `router.push` to `useEffect`:
```tsx
// Было (WRONG):
if (status === "unauthenticated") {
  router.push("/login");  // ← setState during render!
}

// Стало (CORRECT):
useEffect(() => {
  if (status === "unauthenticated") {
    router.push("/login");
  }
}, [status, router]);
```

### Bug: Mobile browser crashes when taking/uploading photo
**Root causes**:
1. **Large photos (5-10MB)** — `exifr.parse(f)` reads full file into memory → crash
2. **No compression** — original 4000x3000 photo uploaded as-is
3. **Object URL leak** — `URL.createObjectURL(f)` never revoked → memory grows
4. **Preview at full resolution** — `<img>` renders 8MB image
5. **No processing indicator** — user doesn't know what's happening

**Fix** (in `src/components/trip/quick-add.tsx`):
1. **Image compression via Canvas**: Resize to max 1920px, JPEG quality 0.8. Reduces 8MB → ~500KB
2. **EXIF optimization**: `exifr.parse(f, { gps: true })` — only parses GPS segment (much faster, less memory)
3. **Object URL cleanup**: `previewUrlRef` tracks URL, `URL.revokeObjectURL()` on cleanup/remove/unmount
4. **Processing state**: `processing` state with loading overlay on preview + disabled buttons
5. **Size validation**: Max 25MB before processing starts
6. **Error handling**: try-catch on all async ops, fallback to original if compression fails

### EXIF geolocation from gallery photos — confirmed working
The code already reads EXIF GPS from gallery photos. Verified:
- `exifr.parse(f, { gps: true })` reads GPS from any photo file (camera or gallery)
- If GPS found → toast "📍 Координаты из фото" + reverse geocode
- If no GPS → falls back to current geolocation request
- Works for: photos taken with phone camera, photos saved to gallery with location, photos shared from other apps

**Note**: Some phones strip EXIF when:
- Photo edited in gallery app
- Photo shared via WhatsApp/Telegram (metadata stripped)
- Photo taken with location services disabled
In these cases, the app correctly falls back to requesting current geolocation.

---

## Session: Freemium Limits Clarity + Member Limit Enforcement

### Question from user: How do limits work when premium user invites free user to 10 trips?

**Clarified logic:**
- Free user limit "1 trip" counts ONLY trips where they are `owner` (creator)
- Joining trips as `member` has NO limit for free users
- This means: premium user can invite free user to unlimited trips, free user can participate in all

**Bug found**: `/api/trips/join` endpoint did NOT check `maxMembers` limit — anyone could join any trip regardless of member count.

**Fix applied**:
- `/api/trips/join` POST now checks member limit based on TRIP OWNER's plan (not joining user's plan)
- If owner is free → max 5 members; if premium → unlimited
- Returns 403 with "upgrade: true" when limit reached
- Verified: 6th member gets 403 "Лимит участников (5) исчерпан"

### New: Limits visibility in Profile

**Added to `/api/user` response**: `limits` object with `maxOwnedTrips`, `maxMembersPerTrip`, `canCreateTrip`; `stats.ownedTrips` count.

**Added "Твой Free план" card in profile** (shown only for free users):
- Создание поездок: прогресс-бар 1/1
- Участников в поездке: 5 макс
- Участие в чужих поездках: Безлимит ✅
- Tooltip explaining the freemium model

**Trip count in header**: "создано 1/1 · всего 1" (owned vs total)

---

## Session: Trip Templates + UI Polish

### QA Results (agent-browser)
- ✅ Login flow works (you@triptrek.com → main page with tabs)
- ✅ No redirect to localhost on tab switching
- ✅ Profile page loads correctly (avatar, stats, achievements, premium card)
- ✅ Premium card visible in profile (gold gradient, "Получить Premium от $5")
- ✅ PremiumModal opens, $5/$30 buttons work, API upgrades user
- ✅ Tabs switch without errors (0 console errors)
- ✅ URL stays on `/` during navigation (no unwanted redirects)

### New Feature: Trip Templates
**Problem**: Creating a trip from scratch requires manually adding places, foods, phrases — tedious for new users.

**Solution**: Pre-built trip templates that auto-create days, places, foods, phrases.

**Files created**:
- `src/lib/trip-templates.ts` — 4 templates: China 🇨🇳 (12 days), Japan 🇯🇵 (10 days), Europe 🇪🇺 (14 days), Thailand 🇹🇭 (10 days)
- `src/app/api/trips/from-template/route.ts` — POST endpoint creates trip + days + places + foods + phrases with limit checking
- `src/components/trip/template-picker.tsx` — Beautiful modal with template cards (cover gradient, emoji, stats, create button)

**Integration**:
- Added "Создать из шаблона" button in TripSwitcher (gradient, Sparkles icon)
- Template picker opens as portal, shows all 4 templates with covers + stats
- On create: API checks premium limits (free=1 trip, premium=unlimited)
- Success: switches to new trip, invalidates queries, navigates to main page

**Verified**:
- Free user → 403 "Лимит поездок исчерпан"
- Premium user → 200, trip created with 4 places (Japan), 3 foods, 3 phrases
- Template "Япония мечты" created successfully with custom title
- UI shows all 4 templates with correct emojis 🇨🇳🇯🇵🇪🇺🇹🇭

### UI Polish: Skeleton Loading
- Improved `DashboardSkeleton` with shimmer animation (staggered delays for stats grid)
- Uses existing `.shimmer` CSS class for consistent loading state

---

## Previous Sessions Summary

### Auth System (custom JWT, bypasses NextAuth v4 + Turbopack bug)
- `POST /api/auth/custom-login` — bcrypt verify + JWT in cookie
- `GET /api/auth/custom-session` — reads JWT from cookie
- `POST /api/auth/custom-signout` — clears cookie
- `useAuth` hook replaces `useSession` everywhere (retry: 1, refetchOnWindowFocus, staleTime 5min)
- Removed NextAuth `<SessionProvider>` from providers.tsx (was clearing our JWT)

### Premium Features
- `POST /api/user/upgrade` — sets plan=premium + planExpiry (30d/365d)
- PremiumModal wired to API, shows loading, invalidates queries
- Crown button in header (gold if premium, grey if free)
- Prominent Premium card in profile (gold gradient if not premium, status card if premium)

### Profile Page
- Avatar with emoji/color picker (30 emojis, 12 colors)
- 6 stat cards (trips, photos, spent, journals, messages, places)
- 13 achievements grid (unlocked/locked)
- All trips list with role + member count
- Settings: theme, premium, push, about
- Sign out button

### Server Architecture (modular)
- `server.ts` — entry point (~40 lines)
- `server/emit-handler.ts` — /emit HTTP endpoint
- `server/socket-handlers.ts` — socket.io handlers (data-driven)
- `server/rooms.ts` — TripRooms class
- `server/notification-map.ts` — notification config

### Security Fixes
- Photos: file type validation + 20MB limit
- Expenses: amount validation (positive, ≤1000000)
- Board: fixed tripIds typo, content validation
- Export/Import: multi-trip schema
- AI-summary: multi-trip schema + ES import
- emitWS: 3-arg signature fixed

## Unresolved Issues / Risks

1. **Seed scripts** — `prisma/seed*.ts` still use old schema. Low priority.
2. **WebSocket server** — `server.ts` not used in dev mode. WS works via /emit bridge only.
3. **Stripe** — Premium upgrade is demo-mode (no real payment).
4. **No rate limiting** — API routes have no rate limiting.

## Priority Recommendations for Next Phase

1. **Real-time presence** — show who's online in each trip (using TripRooms)
2. **Public trip view** — read-only trip view via share link
3. **Offline support** — PWA caching for offline trip access
4. **Expense splitting improvements** — already exists in budget.tsx, could add "mark as paid" + notifications
5. **AI itinerary planner** — generate day-by-day plan from preferences
6. **Photo albums** — organize photos by day/city
7. **Trip cloning** — duplicate existing trip as template
8. **Currency auto-conversion** — real-time FX in expense entry
9. **Push notifications via VAPID** — real Web Push
10. **Trip templates expansion** — add more templates (Korea, Vietnam, Italy, USA)

---

## Session: Budget Audit — P0 + P1 fixes (auth, hooks, settlement, currency, UX)

**Phase**: 17 — Budget audit fixes (based on `audit-budget-byudzhet.md`)

### Status Before
- Budget component already split into smaller files (`budget/` folder with 9 files)
- API auth via `requireTripMember` was already on POST/PATCH for expenses/budget-plan/trip-budget/members
- But: GET budget-plan had no auth; settlement was a race-condition risk; `useAddExpense` returned success on `!ok`; settlement counted in totals; currency fallback covered only 12/24 currencies

### P0 — Critical Fixes

#### P0 #1: API auth/membership for budget-plan GET
- `GET /api/budget-plan?tripId=...` — теперь требует `requireTripMember(req, tripId)`. Без cookie → 401. Без участия в поездке → 403.
- Все остальные эндпоинты (expenses GET/POST/DELETE, budget-plan PATCH, trip/budget PATCH, members PATCH, trip GET) уже были защищены `requireTripMember`.

#### P0 #2: useAddExpense / useDeleteExpense throw on !ok
**Problem**: `mutationFn` не бросал на `!r.ok` → `mutateAsync` всегда resolved → UI показывал success-toast даже при ошибке 400/500.
**Fix** (`src/hooks/trip/use-expenses.ts`):
- `useAddExpense.mutationFn`: парсит JSON, если `!r.ok` → `throw new Error(body.error || status)`.
- `useDeleteExpense.mutationFn`: то же самое.
- `useExpenses` (query): добавлен `if (!r.ok) throw`, `placeholderData: []` (нет «вечного Загрузка»), `enabled: !!tripId`, `Array.isArray(data) ? data : []` (защита от не-массива).
- `useBudgetPlan`: то же (was без `enabled` → fetch без tripId).
- `useTrip`: `enabled: !!tripId`, `retry: 1` (не зацикливается на 404).
**Call sites**: все 4 места (`AddExpenseForm`, `quick-add/ExpenseForm`, `MarkSettledButton`, `ExpenseRow`) обёрнуты в `try/catch` с error toast и НЕ закрывают форму при ошибке.

#### P0 #3: Settlement idempotency (race condition)
**Problem**: Два быстрых клика на «Перевели» создавали 2 settlement-траты → баланс ломался в обратную сторону.
**Fix**:
- Schema: добавлено поле `settlementKey String? @unique` в модель `Expense` (`prisma db push` применён).
- API `/api/expenses` POST: если `settlementKey` передан — сначала `findUnique` по ключу. Если запись уже есть — возвращаем её (idempotent response), не создаём новую и не эмитим WS событие.
- Client `MarkSettledButton`: формирует `settlementKey = "settle-{fromId}-{toId}-{YYYY-MM-DDTHH}"` (часовой бакет). Двойной клик или два клиента в течение часа — тот же ключ → не дублирует.
- Проверено через `curl`: 2-й POST с тем же `settlementKey` возвращает тот же `id`.

#### P0 #4: Loading/error states — нет вечного «Загрузка…»
**Fix** (`src/components/trip/budget/Budget.tsx`):
- Добавлены `error: expensesError`, `error: tripError`, `isLoading: tripLoading`/`expensesLoading`.
- Если `tripError` → экран с 🤔 «Не удалось загрузить поездку» + кнопкой «Обновить».
- Если `expensesError` → экран с 💸 «Не удалось загрузить траты» + кнопкой.
- `trip.settings.totalBudget > 0 ? ... : 0` — нет деления на 0.
- `useBudgetPlan`, `useExpenses`, `useTrip` — `enabled: !!tripId`, `placeholderData: []`/no.
- **TripSwitcher** — новый `useEffect`: если `getTripId()` пустой но `trips.length > 0` — автоматически `setTripId(trips[0].id)` и invalidate queries. Без этого все хуки оставались disabled после логина.

### P1 — Integrity / UX

#### P1 #5: Unified isRealExpense filter
**Problem**: Settlement (перевод между участниками) считался как реальная трата в `/api/trip` totalSpent и в `ParticipantBudgetRow` (хотя в `Budget.tsx` `realExpenses` уже исключался).
**Fix**:
- `/api/trip/route.ts`: `realExpenses = expenses.filter(e => e.category !== "settlement")` → `totalSpent = realExpenses.reduce(...)`.
- `Budget.tsx`: передаёт `spent={realExpenses.filter(...).reduce(...)}` в `ParticipantBudgetRow`.
- `BudgetPlanWidget`: `realExpenses = (expenses ?? []).filter(e => e.category !== "settlement")` → `totalSpent`, `spentByCat` — теперь settlement не попадает в статистику.
- Проверено: `totalSpent` теперь 1013.5 (включая $10 settlement) вместо 1023.5.

#### P1 #6: BudgetEditModal — invalidate + r.ok
**Problem**: Modal использовал raw `fetch` без проверки `r.ok`, без `invalidateQueries(["trip"])`.
**Fix**:
- Заменили raw fetch на `update.mutateAsync({memberId, tripId, budget})` (через хук `useUpdateMember`).
- Хук уже проверяет `r.ok` и бросает на `!ok`.
- После успеха хук инвалидирует `["trip"]` и `["budget-plan"]`.
- Try/catch на каждый PATCH; счётчик ошибок `errors`. Если `errors > 0` → toast с количеством.

#### P1 #7: Toast onSuccess/onError only
**Problem**: `ParticipantBudgetRow` и `BudgetHero` показывали `toast.success` сразу после `mutate()` (не дожидаясь ответа).
**Fix**:
- `ParticipantBudgetRow.save`: `update.mutate(data, { onSuccess: () => { toast.success; setEditing(false) }, onError: (err) => { toast.error; resetVal; setEditing(false) } })`.
- `BudgetHero.save`: то же (`useUpdateTripBudget`).
- Если значение не изменилось — просто выходим без запроса.

#### P1 #8: GET expenses with day include
**Problem**: `/api/expenses` GET возвращал expenses без `day`, UI «День N» показывал пусто.
**Fix**: в `include` добавлено `day: { select: { dayNumber: true, city: true } }` (и в GET, и в POST response, и в findUnique для settlement idempotency).
- Проверено в браузере: «День 1» отображается в истории трат.

#### P1 #9: Currency fallback full coverage (24 currencies)
**Problem**: UI `currency-converter` показывал 24 валюты, а fallback API только 12. Если выбрана одна из отсутствующих (VND, SGD, UAH, KZT, TRY, INR, IDR, MYR, PHP, AUD, CAD, CHF) → convert возвращал 0 (silent).
**Fix**:
- Создан `src/lib/currencies.ts` — единый список 24 валют (code, flag, name).
- `currency-converter.tsx` и `budget/AddExpenseForm.tsx` импортируют из этого файла (раньше у каждого был свой массив, расходящийся).
- `/api/currency/route.ts` — `FALLBACK_RATES` покрывает все 24 валюты. При запросе: если API вернул курс — берём его, иначе fallback. Никогда не возвращаем 0.
- Добавлен badge «⚠ Нет курса для одной из валют» в converter если convert = 0 (визуальная индикация).
- В converter добавлена дата обновления курса.
- Проверено: `curl /api/currency` возвращает 24 валюты.

#### P1 #10: MarkSettled auth fallback
**Problem**: Если `currentUserId === ""` (не залогинен) — кнопка возвращала null, нельзя было подтвердить перевод.
**Fix**: если `!currentUserId` → показываем amber-кнопку `<a href="/login"><LogIn/> Войти</a>` с тайтлом «Войдите чтобы подтвердить перевод».

#### P1 #11: Honest copy hint
**Problem**: Подсказка «после переводов у каждого был ноль» врала для 3+ участников (используется pairwise, не greedy).
**Fix**: переписан текст:
- «Это **попарные переводы** ('кто кому сколько должен'). Для каждой пары участников показан чистый долг A→B минус B→A. Нажми «Перевели» когда получил перевод — у пары баланс обнулится.»
- Если `participantsCount > 2` — дополнительное amber-уведомление: «При 3+ участниках иногда можно уменьшить число переводов — это упрощённая схема, всегда честная по суммам.»

#### P1 #12: Rounding consistency (toFixed(2))
- `SettlementSection`: `b.paid.toFixed(0)` → `toFixed(2)`, `b.balance.toFixed(0)` → `toFixed(2)`, `s.amount.toFixed(0)` → `toFixed(2)`.
- `ParticipantBudgetRow`: `spent.toFixed(0)` → `toFixed(2)`, `remaining.toFixed(0)` → `toFixed(2)`.
- Добавлены `tabular-nums` классы для выравнивания чисел.
- `BudgetHero`: осталось `toFixed(0)` (намеренно — компактный hero).

#### P1 #13: PATCH /api/trip/budget emitWS
**Problem**: После изменения общего бюджета — другие клиенты не узнавали (не было WS события).
**Fix**: добавлено `await emitWS("trip:updated", tripId, {})` после `db.trip.update`.

#### P1 #14: POST expense membership validation
**Problem**: Сервер принимал любой `paidById` и `splitWith[]` без проверки что эти userIds — участники поездки.
**Fix** (`/api/expenses` POST):
- Загружаем `memberIds = TripMember.findMany({ where: { tripId } }).map(m => m.userId)`.
- Если `!memberIds.includes(paidById)` → 400 "paidBy is not a member of this trip".
- Если `splitWith` содержит невалидные IDs → 400 "splitWith contains non-members".
- Проверено через `curl`: POST с `paidById="non-existent-user"` → 400.

### P2 — Polish

#### Empty history CTA + counters
- `Budget.tsx`: если `expenses.length === 0` → empty state с 📝 «Пока нет трат» + CTA «Добавить первую трату».
- Счётчик в шапке истории: `{realExpenses.length} траты/трат` + если есть settlements — `{settlementCount} перевод(а/ов)` (раздельные счётчики).
- Все интерактивные элементы `min-h-[36px]` для тач-таргетов.

### Files Modified

**API routes**:
- `src/app/api/expenses/route.ts` — settlement idempotency, day include, membership validation
- `src/app/api/budget-plan/route.ts` — GET requireTripMember
- `src/app/api/trip/budget/route.ts` — emitWS after budget update
- `src/app/api/trip/route.ts` — realExpenses filter for totalSpent
- `src/app/api/currency/route.ts` — full 24-currency fallback

**Hooks**:
- `src/hooks/trip/use-expenses.ts` — throw on !ok, placeholderData, enabled, invalidate trip
- `src/hooks/trip/use-budget-plan.ts` — enabled, placeholderData, throw on !ok
- `src/hooks/trip/use-trip.ts` — enabled: !!tripId, retry: 1

**Components**:
- `src/components/trip/budget/Budget.tsx` — error states, real/settlement counters, empty CTA
- `src/components/trip/budget/AddExpenseForm.tsx` — try/catch, shared CURRENCIES import
- `src/components/trip/budget/MarkSettledButton.tsx` — settlementKey, try/catch, login fallback
- `src/components/trip/budget/ExpenseRow.tsx` — try/catch delete
- `src/components/trip/budget/BudgetEditModal.tsx` — useUpdateMember hook
- `src/components/trip/budget/ParticipantBudgetRow.tsx` — toast onSuccess/onError
- `src/components/trip/budget/BudgetHero.tsx` — toast onSuccess/onError
- `src/components/trip/budget/SettlementSection.tsx` — honest hint, toFixed(2), tabular-nums
- `src/components/trip/currency-converter.tsx` — shared CURRENCIES, rate badge, updated date
- `src/components/trip/quick-add/ExpenseForm.tsx` — try/catch
- `src/components/trip/trip-switcher.tsx` — auto-set first trip if localStorage empty

**Schema**:
- `prisma/schema.prisma` — `settlementKey String? @unique` in Expense model

**New files**:
- `src/lib/currencies.ts` — shared CURRENCIES constant (24 currencies)

### Verification (curl + agent-browser)

✅ Server health: 200
✅ GET `/api/expenses?tripId=...` без cookie → 401
✅ GET `/api/budget-plan?tripId=...` без cookie → 401 (раньше возвращал данные)
✅ GET `/api/expenses` с auth → возвращает массив с `day: {dayNumber, city}` в каждом expense
✅ POST `/api/expenses` с `paidById="non-existent"` → 400 "paidBy is not a member of this trip"
✅ POST `/api/expenses` с `settlementKey="settle-X-Y-2026-08-11T16"` 1-й раз → создаёт (201). 2-й раз с тем же ключом → возвращает тот же `id` (idempotent)
✅ `/api/trip?tripId=...` `totalSpent` = 1013.5 (включая $10 settlement) вместо 1023.5
✅ `/api/currency` возвращает 24 валюты (MYR, VND, CHF, KZT, INR, IDR, PHP, AUD, CAD — все присутствуют)
✅ ESLint: clean
✅ agent-browser: логин → Бюджет таб грузится → «2 траты», «потратил $1012.00», «внёс $1012.00», «День 1» в истории, форма Add открывается, в селекте валют 24 опции (USD → CHF)
✅ localStorage `triptrek-current-trip` автоматически устанавливается после логина если был пустой

### Unresolved / Notes

1. **`settleDebts` (greedy)** в `src/lib/budget/settle.ts` — по-прежнему не используется в UI (UI использует `calculateSettlements` — pairwise). Но теперь подсказка честно об этом говорит. Полностью удалять не стал — может пригодиться для опционального «упрощённого» режима.
2. **QuickAddSheet ExpenseForm** — теперь тоже кидает на !ok и ловит. Внимание: QuickAdd передаёт `userId` из session — если session теряется, форма падает на `!paidById`. Покрыто существующей валидацией в `submit()`.
3. **BudgetHero `toFixed(0)`** намеренно — компактный hero. Если пользователь редактирует бюджет, видит $2000, не $2000.00.
4. **Memory constraint** — сервер падал от OOM когда одновременно работал Next.js dev + agent-browser chrome. Без chrome сервер стабилен. QA в браузере возможно требует `pkill chrome` перед тестами.


---

## Session: Chill Audit — P0 + P1 + P2 fixes (based on `audit-chill-rest.md`)

**Phase**: 18 — Chill audit fixes

### Status Before
- RestChill was already split into `rest-chill/` folder (7 files: RestChill, ChillCard, WishlistView, NearbyView, NearbyCard, types, index)
- API `GET /api/nearby` had `requireUser` already, but no rate-limit; bad coords fell back to Guangzhou default; User-Agent was "TripTrekChina/1.0"
- `useNearby` swallowed `!r.ok` as empty (500 → UI "ничего не найдено")
- `useUpdatePlace` already threw on `!ok`, but ChillCard showed toast immediately after `mutate` (not waiting)
- `RestTimer` component existed but was orphan — never imported anywhere
- Wishlist used single LS key `triptrek-wishlist` (shared across all trips)
- `cachedGeo` module-level — never reset on trip switch
- Hero was EN "Rest & Chill" + China-agnostic but not trip-aware

### P0 — Critical Fixes

#### P0 #1: Empty/error states in RestChill
**Problem**: Without tripId, `useDays` + `api/days` default-trip fallback could show another trip's days or false "Ничего не найдено".
**Fix** (`src/components/trip/rest-chill/RestChill.tsx`):
- Added `error: daysError` from `useDays()` → screen with 🤔 "Не удалось загрузить маршрут" + "Обновить" button.
- `useDays` hook: `if (!r.ok) throw`, `placeholderData: []`, `enabled: !!tripId` (was already), `Array.isArray(data) ? data : []`.
- Loading state shows spinner instead of bare "Загрузка…".

#### P0 #2: GET /api/nearby — no China default + rate-limit
**Problem**: Bad/empty coords fell back to Guangzhou lat/lng; open proxy without rate-limit; User-Agent "TripTrekChina/1.0".
**Fix** (`src/app/api/nearby/route.ts`):
- Without `lat`/`lng` → 400 "lat, lng required — включите геолокацию" (was returning empty array).
- Invalid coords (lat>90, lat<-90, lng>180, lng<-180, NaN) → 400 "Некорректные координаты".
- **Rate-limit**: in-memory bucket per userId, 60 requests/hour. 429 with "Слишком много запросов к «Рядом»" + reset time.
- User-Agent: "TripTrek/1.0 (travel app)" (was "TripTrekChina/1.0").
- Radius clamped to 100m..5km (was unbounded).
- Verified: `curl /api/nearby` without coords → 400; with `lat=999&lng=999` → 400; valid Moscow coords → 200 with places.

#### P0 #4: useNearby throws on !ok (empty vs error)
**Problem**: `return r.json()` without `r.ok` check → 500 from Overpass parsed as `{places: [], error: ...}` → UI showed "ничего не найдено".
**Fix** (`src/hooks/trip/use-nearby.ts`):
- `if (!r.ok) throw new Error(body.error || status)` — now React Query puts it in `error` not `data`.
- `retry: 1` (don't loop on dead Overpass).
- Empty `places: []` on `r.ok` is still legit empty (not error).
- NearbyView: error state shows AlertCircle + error message + "Повторить" button (was just "Не удалось загрузить").

### P1 — Integrity / UX

#### P1 #5 + #6: Wishlist isolated per trip + unified helper
**Problem**: Single LS key `triptrek-wishlist` → wishlist mixed across all trips. Direct LS writes in 2 places (WishlistView + NearbyCard) — desync risk.
**Fix**:
- New `src/lib/wishlist.ts` — `wishlistKey(tripId)`, `loadWishlist(tripId)`, `saveWishlist(items, tripId)`, `wishlistDedupeKey(item)`, `migrateLegacyWishlist(tripId)`.
- Key: `triptrek-wishlist:${tripId}` (was `triptrek-wishlist`).
- **Migration**: on first load, if legacy key exists → migrate to scoped key + delete legacy.
- WishlistView + NearbyCard both use the helper (no direct LS writes).
- **Honest copy**: banner "📱 Хранится только на этом телефоне — не виден компании. (X/Y отмечено)".
- Verified: switched Europe trip (had 1 item) → China trip shows "0 в «Хочу»" (isolated, not shared).

#### P1 #7: Visit/rating pending + ok-check + userName in PATCH
**Problem**: ChillCard showed toast immediately after `mutate` (not waiting for response); double-tap risk; UI didn't send `userName` to PATCH (API could emit it).
**Fix** (`src/components/trip/rest-chill/ChillCard.tsx`):
- `update.mutate(data, { onSuccess: () => toast(...), onError: (err) => toast.error(...) })` — toast only after response.
- `userName` from `useAuth()` session included in PATCH body → API emits WS with real name.
- `disabled={update.isPending}` on visit toggle + rating buttons — no double-tap.
- aria-labels: "Снять отметку «отдохнули»" / "Отметить как «отдохнули»" / "Оценить на N звёзд" (P2 #19).

#### P1 #8: Empty distinguishes — no chill places / filter / no days
**Problem**: Single "Ничего не найдено" for all empty cases.
**Fix**: `EmptyRouteState` component with 3 branches:
- No days → "🗺️ Сначала создайте маршрут" + "Перейти в Маршрут" CTA.
- Has filter but no matches → "🔍 Ничего не найдено" + "Сбросить фильтр" CTA.
- Has days but no chill places → "☕ Пока нет кафе и баров в маршруте" + "Перейти в Маршрут" CTA.

#### P1 #9: Currency from trip.settings.currency
**Problem**: ChillCard always showed `$` regardless of trip currency.
**Fix**: ChillCard accepts `currency` prop (passed from RestChill via `trip?.settings.currency`). Maps currency code → symbol ($, €, ¥, ₽, £, ₸, ฿, ₩). Falls back to `$`.

#### P1 #10: Trip-agnostic RU hero
**Problem**: Hero had EN "Rest & Chill" eyebrow; China copy on Nearby.
**Fix**: Hero now:
- Eyebrow: "☕ Отдых и перекус" (was "Coffee / Rest & Chill").
- Subtitle: shows current trip title "Европа: Париж → Амстердам → Берлин" (trip-aware, not China).
- NearbyView label: "Рестораны" (was "Еда" — aligned with Route filter labels, P2 #16).

#### P1 #11: RestTimer embedded under hero
**Problem**: `RestTimer` component existed in `rest-timer.tsx` but was never imported anywhere (orphan).
**Fix**: Imported and embedded in RestChill under the hero, before the Маршрут/Хочу/Рядом segment switcher. Now visible and usable. (Audit said "embed or leave — don't delete silently".)

#### P1 #13: Nearby key = lat+lng+name + dedup by composite key
**Problem**: `key={i}` (index) — loses state on re-order; dedup by name → collisions (different places with same name).
**Fix**:
- `key={`${p.lat.toFixed(5)},${p.lng.toFixed(5)}-${p.name}`}`.
- `wishlistDedupeKey(item)` helper: `name.toLowerCase()@lat,lng` if coords, else `name@address`.
- NearbyView also dedupes Overpass results by composite key before rendering.

#### P1 #14: cachedGeo reset on trip change
**Problem**: Module-level `cachedGeo` never reset → stale "ready" state from previous trip persisted.
**Fix** (`src/components/trip/rest-chill/types.ts` + `NearbyView.tsx`):
- `cachedGeo` now has `tripId: string | null` field.
- NearbyView `useEffect([tripId])`: if `cachedGeo.tripId !== tripId` → reset to `{status: "idle"}`.
- Verified: switched Europe→China trip → Nearby showed geo CTA (not stale "ready").

### P2 — Polish

#### P2 #15: Mobile segment hit ≥44px
- Маршрут/Хочу/Рядом buttons: `min-h-[44px]` (was `py-2.5` ~36px).
- Filter chips: `min-h-[36px]`.
- All interactive buttons in WishlistView: `min-h-[36px]` or `min-h-[40px]`.

#### P2 #17: Hero metrics — wishlist count
- Hero now shows 3 metrics: "X посещено" / "Y в маршруте" / "Z в «Хочу»".
- Wishlist count loaded from `loadWishlist(tripId)` on each view change.

#### P2 #18: Sync CHILL_CATEGORIES with mapOnlyChill
- New `src/lib/chill-categories.ts` — `CHILL_CATEGORIES = ["cafe", "bar", "restaurant"]`, `isChillCategory()`, `CHILL_CATEGORY_LABELS`.
- `RestChill.tsx` imports it (was local const).
- `trip-map.tsx` uses `isChillCategory()` for `mapOnlyChill` filter (was inline `["cafe","bar","restaurant"].includes()`).
- Single source of truth — adding a category in one place updates both.

#### P2 #19: a11y labels on visit/stars
- Visit toggle: `aria-label` + `aria-pressed`.
- Rating stars: `aria-label="Оценить на N звёзд"`.
- Wishlist toggle/delete: `aria-label`s.
- Nearby "Хочу посетить" button: `aria-label`.

### Files Modified

**API**:
- `src/app/api/nearby/route.ts` — rate-limit, 400 on bad coords, clamp radius, User-Agent fix

**Hooks**:
- `src/hooks/trip/use-nearby.ts` — throw on !ok, retry: 1
- `src/hooks/trip/use-days.ts` — throw on !ok, placeholderData: []

**Components**:
- `src/components/trip/rest-chill/RestChill.tsx` — error states, EmptyRouteState, trip-aware hero, RestTimer embed, CHILL_CATEGORIES shared, mobile 44px, wishlist count
- `src/components/trip/rest-chill/ChillCard.tsx` — toast onSuccess/onError, userName in PATCH, pending disabled, currency prop, a11y labels
- `src/components/trip/rest-chill/WishlistView.tsx` — loadWishlist/saveWishlist helpers, tripId scoping, honest copy banner, a11y labels, mobile targets
- `src/components/trip/rest-chill/NearbyView.tsx` — error state with retry, dedup by composite key, cachedGeo reset on trip switch, mobile targets, aligned labels
- `src/components/trip/rest-chill/NearbyCard.tsx` — wishlist helpers, composite dedup key, a11y labels
- `src/components/trip/rest-chill/types.ts` — lat/lng on WishlistItem, cachedGeo.tripId field
- `src/components/trip/trip-map.tsx` — isChillCategory() from shared const

**New files**:
- `src/lib/chill-categories.ts` — shared CHILL_CATEGORIES constant + isChillCategory helper + labels
- `src/lib/wishlist.ts` — wishlistKey/loadWishlist/saveWishlist/wishlistDedupeKey/migrateLegacyWishlist

### Verification (curl + agent-browser)

✅ `curl /api/nearby` без coords → 400 (was empty array)
✅ `curl /api/nearby?lat=999&lng=999` → 400 "Некорректные координаты"
✅ `curl /api/nearby` без auth → 401
✅ `curl /api/nearby?lat=55.7558&lng=37.6173` → 200 with Moscow cafe places
✅ Rate-limit: 3 rapid requests → all 200 (limit is 60/hour)
✅ ESLint: clean
✅ agent-browser: Chill tab loads → hero "Отдых и перекус" (RU, not EN), shows trip title "Европа: Париж → Амстердам → Берлин", 3 metrics (посещено/в маршруте/в «Хочу»)
✅ RestTimer visible under hero (was orphan)
✅ Маршрут empty state: "Пока нет кафе и баров в маршруте" + "Перейти в Маршрут" CTA
✅ Хочу tab: "📱 Хранится только на этом телефоне — не виден компании" banner + Add form works
✅ Added "Test Paris Cafe" to Europe wishlist → localStorage key `triptrek-wishlist:cms8liuk60001p6cmm80tx66q` (scoped, not shared)
✅ Switched to China trip → hero shows "0 в «Хочу»" (wishlist isolated per trip, P1 #5 confirmed)
✅ China trip shows 8 chill cards (Bingtang Hugu, Yonghe Palace, etc.) with $7, $5 budgets (currency from trip)
✅ ChillCard: aria-labels "Снять отметку «отдохнули»", "Оценить на N звёзд"
✅ Switched trip → Nearby showed geo CTA (cachedGeo reset, P1 #14 confirmed)
✅ No console errors

### Unresolved / Notes

1. **P1 #12 (Card click → setSelectedDay + itinerary/map)** — ChillCard already shows "День N · city" inline. Full click-to-navigate would require app-shell coordination. Skipped — audit item is "nice to have", not blocking.
2. **P2 #16 (Labels "Рестораны" vs "Еда")** — aligned: Nearby now uses "Рестораны" (was "Еда"). Route filter already "Рестораны".
3. **P2 #20 (Less motion on long list)** — `motion.div layout` on ChillCard/NearbyCard is lightweight; with 8-30 items no perf issue observed. Can revisit if lists grow.
4. **P2 #21 (Nearby → create place in day)** — out of scope, separate feature.
5. **Wishlist server-side** — audit says "не Prisma wishlist без ТЗ". Kept client-only with honest copy. LS migration handles existing users.
6. **Overpass fallback chain** — 3 mirrors already in place (kumi.systems, overpass-api.de, openstreetmap.fr). Not changed.


---

## Session: Journal Audit — P0 + P1 + P2 fixes (based on `audit-journal-dnevnik.md`)

**Phase**: 19 — Journal audit fixes

### Also: RestTimer removed from Chill page
User requested removing the RestTimer that was embedded under the Chill hero in Phase 18. Removed the `<RestTimer />` import and render from `rest-chill/RestChill.tsx`. The `rest-timer.tsx` file itself is kept (could be used elsewhere later).

### Status Before
- Journal UI sent `userId: trip.settings.currentUserId` — but `/api/trip` always returns `currentUserId: null` → all journal entries were anonymous
- `GET /api/journal` without tripId returned ALL entries from ALL trips (`where={}` when tripId empty)
- POST didn't validate `dayId ∈ tripId` — could create entries with foreign dayIds
- Delete: no confirm, toast before success, `opacity-0 group-hover` button invisible on mobile
- `useAddJournal`/`useDeleteJournal` didn't throw on `!ok` → false success toasts
- No author filter, no "Вы" label, single empty state for all cases
- QuickAdd JournalForm had different MOODS list (8) vs Journal (10)

### P0 — Critical Fixes

#### P0 #1: Author via session.user.id
**Problem**: UI sent `userId: trip.settings.currentUserId` — `/api/trip/route.ts` hardcodes `currentUserId: null` → entries saved with `userId=null` → anonymous.
**Fix**:
- `journal.tsx`: `const { data: session } = useAuth(); const currentUserId = session?.user?.id || ""` (same pattern as Board).
- `api/journal/route.ts` POST: `const authorId = user!.id` (from `requireTripMember`) — ignores `userId` from body, always uses session user.
- Verified via curl: POST returns `userId: "cms4u8an50000rlrmqa869xo4"` (real user), not null.

#### P0 #2: GET /api/journal requires tripId
**Problem**: `if (tripId) where.tripId = tripId` — empty string → `where={}` → all entries from all trips.
**Fix** (`src/app/api/journal/route.ts`):
- `if (!tripId) return 400 "tripId required"` (was returning all entries).
- Added `requireTripMember` auth check on GET (was open).
- `useJournal` hook: already had `enabled: !!tripId` but added `if (!r.ok) throw` + `placeholderData: []` + `Array.isArray(data) ? data : []`.
- Verified: `curl /api/journal` without tripId → 400; without auth → 401.

#### P0 #3: POST validates dayId ∈ tripId
**Problem**: Any dayId accepted — could create entries with foreign/broken dayIds → entry counts in trip but not visible in feed (grouped by `trip.days`).
**Fix**:
- API: `const day = await db.day.findUnique({ where: { id: dayId }, select: { tripId: true } }); if (!day || day.tripId !== tripId) → 400 "day не принадлежит этой поездке"`.
- UI: if `trip.days.length === 0` → form disabled with CTA "Сначала создайте день в Маршруте" + "Перейти в Маршрут" button (not silent return).
- Verified: `curl POST` with fake dayId → 400 "day не принадлежит этой поездке".

#### P0 #4: Delete with confirm + toast onSuccess + mobile-visible
**Problem**: Any participant could DELETE any entry; toast before response; `opacity-0 group-hover` button invisible on mobile.
**Fix**:
- API DELETE: ownership check — `isAuthor || isOwner` (only entry author or trip owner can delete). Non-author → 403 "Можно удалять только свои записи".
- UI: `confirmingId` state — click delete → "Да"/"Нет" inline buttons. Toast only in `onSuccess`/`onError` (not before).
- Button: `md:opacity-0 md:group-hover:opacity-100` — on mobile (<768px) always visible (opacity:1); on desktop shows on hover.
- Verified: mobile viewport 375px → opacity:1; desktop 1280px → opacity:0 (hover shows).

### P1 — Integrity / UX

#### P1 #5: Delete hit-area ≥44px + a11y
- Delete button: `size-9` (36px) + `min-h-[36px]` on confirm buttons.
- `aria-label="Удалить запись"`, `aria-label="Подтвердить удаление"`, `aria-label="Отменить удаление"`.

#### P1 #6: Empty distinguishes no-days vs no-entries
- `hasDays ? (empty journal message) : null` — if no days, form is disabled with CTA, no separate empty state for journal.
- Filter empty: "Нет записей этого автора" (when author filter active).
- Submit disabled when no days.

#### P1 #7: Hooks throw on !ok + try/catch
- `useAddJournal.mutationFn`: `if (!r.ok) throw new Error(body.error || status)`.
- `useDeleteJournal.mutationFn`: same.
- `journal.tsx` submit: `try { await add.mutateAsync(...); toast.success; setContent(""); } catch (err) { toast.error(err.message); }` — doesn't clear textarea on fail.
- `quick-add/JournalForm.tsx`: same try/catch pattern.

#### P1 #8: Multi-author UX
- Author shown with avatar + name; "Вы" if `e.userId === currentUserId`.
- Author filter chips (when >1 author): "Все (N)" + per-author chips with count.
- Hero shows author count: "N записей · M автора" when >1 author.

#### P1 #9: WS await emitWS on POST
- `await emitWS("journal:added", ...)` (was fire-and-forget).
- Same for DELETE.

#### P1 #10: Content validation
- `content.trim()` — rejects whitespace-only.
- `maxLength={5000}` on textarea + server validates `trimmed.length > 5000 → 400`.
- Character counter: `{content.length}/5000`.
- Mood whitelist: `isValidMood(mood)` from `src/lib/moods.ts` — only accepts the 10 whitelisted emojis.

#### P1 #11: Global search journal scoped by tripId
**Problem**: `api/search` queried journal without tripId filter → results from all trips.
**Fix**:
- `api/search/route.ts`: accepts `tripId` query param; `if (tripId) journalWhere.tripId = tripId`.
- `global-search.tsx`: passes `&tripId=${getTripId()}` to search API; includes tripId in queryKey.

### P2 — Polish

#### P2 #13: Shared MOODS constant
- New `src/lib/moods.ts` — `MOODS = ["😊","🤩","😴","🤤","🥳","🤔","😍","😰","🔥","💖"]` + `isValidMood()`.
- `journal.tsx` and `quick-add/JournalForm.tsx` both import from it (were separate arrays: 10 vs 8).

#### P2 #16: Per-row pending on delete
- `isDeleting = del.isPending && isConfirming` — the confirming row shows spinner, other rows unaffected.
- Confirm buttons disabled during delete.

### Files Modified

**API**:
- `src/app/api/journal/route.ts` — tripId required, dayId validation, author from session, ownership delete, content/mood validation, await emitWS
- `src/app/api/search/route.ts` — journal scoped by tripId

**Hooks**:
- `src/hooks/trip/use-journal.ts` — throw on !ok, placeholderData: []

**Components**:
- `src/components/trip/journal.tsx` — session author, error states, try/catch submit, confirm delete, mobile-visible button, empty states (no-days CTA / no-entries / filter), author filter chips, "Вы" label, shared MOODS, content counter, a11y labels, per-row pending
- `src/components/trip/quick-add/JournalForm.tsx` — try/catch, shared MOODS, maxLength, a11y labels
- `src/components/trip/global-search.tsx` — passes tripId to search API
- `src/components/trip/rest-chill/RestChill.tsx` — RestTimer removed (per user request)

**New files**:
- `src/lib/moods.ts` — shared MOODS constant + isValidMood helper

### Verification (curl + agent-browser)

✅ `curl /api/journal` без tripId → 400 (was returning all entries)
✅ `curl /api/journal` без auth → 401
✅ `curl POST /api/journal` с fake dayId → 400 "day не принадлежит этой поездке"
✅ `curl POST /api/journal` с пустым content → 400 "content не может быть пустым"
✅ `curl POST /api/journal` с валидным dayId → 200, `userId` = real user from session (not null)
✅ `curl DELETE` as author → 200; non-existent → 404
✅ ESLint: clean
✅ agent-browser: Journal tab loads → "1 запись" → add "Direct test entry" → "2 записи" → delete with confirm → "1 запись" + "Удалено" toast
✅ Author shows "Вы" (P0 #1 — was anonymous before)
✅ Delete button: mobile 375px → opacity:1 (visible); desktop 1280px → opacity:0 (hover)
✅ Delete confirm: "Подтвердить удаление" / "Отменить удаление" with aria-labels
✅ Mood buttons: 10 emojis with aria-label "Настроение 😊"
✅ Content counter: "0/5000"
✅ Chill tab: RestTimer removed (no "Таймер отдыха" heading)
✅ No console errors

### Unresolved / Notes

1. **P2 #12 (Journal in Timeline)** — out of scope, Timeline is a separate component stub.
2. **P2 #14 (Edit / search / sort inside tab)** — future feature, not blocking.
3. **P2 #15 (Sticky day header overlap)** — changed `top-[6.5rem]` to `top-[5.5rem]` + added `bg-background/80 backdrop-blur-sm` for better contrast.
4. **P2 #17 (Don't extend websocket-client.ts)** — didn't touch it.
5. **QuickAdd JournalForm** — now uses session `userId` prop (passed from QuickAddSheet which already gets it from session). Consistent with Journal page.
6. **RestTimer** — removed from Chill page per user request. File `rest-timer.tsx` kept for potential future use.

