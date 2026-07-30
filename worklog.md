# TripTrek China — Work Log

## Current Project Status

**Phase**: 9 (Mobile Photo Crash Fix + Turbopack Warning Fix) — COMPLETED
**Build**: ✅ TypeScript clean, ESLint clean
**Dev Server**: Running on port 3000
**Test Accounts**: you@/leha@/den@triptrek.com (password: 1234)

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
