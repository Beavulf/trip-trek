# TripTrek China — Work Log

## Current Project Status

**Phase**: 13 (City Autocomplete Integration + Weather Anywhere + Expense UX + WebSocket) — COMPLETED
**Build**: ✅ TypeScript clean, ESLint clean
**Dev Server**: Running via `bun server.ts` (Next.js + WebSocket on port 3000)
**Test Accounts**: you@/leha@/den@triptrek.com (password: 1234)

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
