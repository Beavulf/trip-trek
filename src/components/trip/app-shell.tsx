"use client";

import { useTrip } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  Images,
  Wallet,
  Coffee,
  BookOpen,
  Info,
  Sparkles,
  Languages,
  CloudSun,
  UtensilsCrossed,
  Trophy,
  MessagesSquare,
  Rss,
  Plus,
  Moon,
  Sun,
  Monitor,
  Search,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Share2,
  Crown,
  MoreHorizontal,
  Bug,
  Shield,
} from "lucide-react";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { useAuth as useSession } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/hooks/use-websocket";
import { QuickAddSheet } from "./quick-add";
import { GlobalSearch } from "./global-search";
import { TripSwitcher } from "./trip-switcher";
import { PremiumModal } from "./premium-modal";
import { PWAUpdateNotification } from "./pwa-update";
import { InviteFriends } from "./invite-friends";
import { ShareCard } from "./share-card";
import { BugReportSheet } from "./bug-report-sheet";
import { NotificationsBell } from "./notifications-bell";
import { TripInfoSheet } from "./trip-info-sheet";
import { useAdminStats } from "@/hooks/use-admin-stats";

const TABS = [
  { key: "dashboard", label: "Обзор", icon: LayoutDashboard },
  { key: "timeline", label: "Лента", icon: Rss },
  { key: "itinerary", label: "Маршрут", icon: ListChecks },
  { key: "map", label: "Карта", icon: MapIcon },
  { key: "gallery", label: "Галерея", icon: Images },
  { key: "budget", label: "Бюджет", icon: Wallet },
  { key: "rest", label: "Chill", icon: Coffee },
  { key: "journal", label: "Дневник", icon: BookOpen },
  { key: "ai", label: "AI", icon: Sparkles },
  { key: "food", label: "Еда", icon: UtensilsCrossed },
  { key: "phrases", label: "Фразы", icon: Languages },
  { key: "weather", label: "Погода", icon: CloudSun },
  { key: "board", label: "Чат", icon: MessagesSquare },
  { key: "achievements", label: "Награды", icon: Trophy },
  { key: "info", label: "Инфо", icon: Info },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { data: session } = useSession();
  const isPremium = (session?.user as { plan?: string } | undefined)?.plan === "premium";
  const isAdmin = session?.user?.isAdmin === true;
  // Бейдж новых отзывов для админа (неадминам эндпоинт недоступен — не опрашиваем)
  const { data: adminStats } = useAdminStats(!!isAdmin);
  const feedbackNew = isAdmin ? adminStats?.feedback.new ?? 0 : 0;
  const { activeTab, setActiveTab } = useTripStore();
  const { data: trip } = useTrip();
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  useWebSocket(trip?.settings.tripId || "");

  // Реальная высота липкого хедера — в CSS-переменную: её используют
  // sticky-элементы контента (линейка дней и т.п.) вместо захардкоженных пикселей
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const sync = () =>
      document.documentElement.style.setProperty("--header-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleTabScroll = () => {
    const el = tabScrollRef.current;
    if (!el) return;
    setShowLeftArrow(el.scrollLeft > 10);
    setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  /** Keep active tab fully visible / centered in the chip rail. */
  const scrollActiveTabIntoView = (behavior: ScrollBehavior = "smooth") => {
    const rail = tabScrollRef.current;
    if (!rail) return;
    const btn = rail.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (!btn) return;

    const railRect = rail.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const btnCenter = btnRect.left + btnRect.width / 2;
    const railCenter = railRect.left + railRect.width / 2;
    const delta = btnCenter - railCenter;
    if (Math.abs(delta) < 4) {
      handleTabScroll();
      return;
    }
    rail.scrollBy({ left: delta, behavior });
    // arrows after scroll settles a bit
    window.setTimeout(handleTabScroll, behavior === "smooth" ? 280 : 0);
  };

  useEffect(() => {
    handleTabScroll();
  }, []);

  useEffect(() => {
    // After tab change (click or store), bring the pill into view
    const id = window.requestAnimationFrame(() => scrollActiveTabIntoView("smooth"));
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when active tab changes
  }, [activeTab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Hero «Обзора» открывает приглашение через событие (состояние шапки сюда не тащим)
  useEffect(() => {
    const openInvite = () => setInviteOpen(true);
    window.addEventListener("triptrek-open-invite", openInvite);
    return () => window.removeEventListener("triptrek-open-invite", openInvite);
  }, []);

  const dayLine = trip
    ? `День ${trip.currentDayNumber}/${trip.settings.totalDays}${trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.city ? ` · ${trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.city}` : ""}`
    : "загрузка…";

  return (
    <div className="min-h-dvh flex flex-col bg-background relative">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 0%, var(--primary) 0%, transparent 50%), radial-gradient(circle at 80% 100%, #8b5cf6 0%, transparent 50%)",
        }}
      />

      <header ref={headerRef} className="sticky top-0 z-40 glass-strong border-b border-border/80 pt-safe">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 h-14 flex items-center gap-1.5 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="size-9 sm:size-8 rounded-xl bg-gradient-to-br from-orange-500 via-rose-500 to-violet-500 grid place-items-center text-white font-bold text-sm shadow-lg shadow-orange-500/20 shrink-0"
            >
              T
            </motion.div>
            <div className="hidden sm:block min-w-0 max-w-[28vw] sm:max-w-none">
              <div className="font-bold text-sm leading-tight truncate">TripTrek</div>
              <div className="text-[10px] text-muted-foreground leading-tight truncate">{dayLine}</div>
            </div>
          </div>

          <div className="flex-1 min-w-0 flex justify-center sm:justify-end">
            <TripSwitcher />
          </div>

          {/* Desktop: full actions */}
          <div className="hidden sm:flex items-center gap-2">
            <HeaderIconBtn
              onClick={() => setPremiumOpen(true)}
              label="Premium"
              className={
                isPremium
                  ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-400/30"
                  : undefined
              }
            >
              <Crown className="size-4" />
            </HeaderIconBtn>
            <HeaderIconBtn onClick={() => setInviteOpen(true)} label="Пригласить друзей">
              <UserPlus className="size-4" />
            </HeaderIconBtn>
            <HeaderIconBtn onClick={() => setInfoOpen(true)} label="О поездке">
              <Info className="size-4" />
            </HeaderIconBtn>
            <HeaderIconBtn onClick={() => setShareOpen(true)} label="Карточка поездки">
              <Share2 className="size-4" />
            </HeaderIconBtn>
            <HeaderIconBtn onClick={() => setSearchOpen(true)} label="Поиск">
              <Search className="size-4" />
            </HeaderIconBtn>
            <NotificationsBell authed={!!session?.user} />
            {isAdmin && (
              <HeaderIconBtn onClick={() => router.push("/admin")} label="Админ-панель">
                <Shield className="size-4" />
              </HeaderIconBtn>
            )}
            <ThemeToggle />
            <ParticipantAvatars />
          </div>

          {/* Mobile: search + more + avatar */}
          <div className="flex sm:hidden items-center gap-1">
            <HeaderIconBtn onClick={() => setSearchOpen(true)} label="Поиск" large>
              <Search className="size-5" />
            </HeaderIconBtn>
            <NotificationsBell authed={!!session?.user} large />
            <div className="relative">
              <HeaderIconBtn
                onClick={() => setMoreOpen((v) => !v)}
                label="Ещё"
                large
                aria-expanded={moreOpen}
              >
                <MoreHorizontal className="size-5" />
              </HeaderIconBtn>
              {feedbackNew > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-background pointer-events-none"
                  aria-hidden
                />
              )}
              <AnimatePresence>
                {moreOpen && (
                  <MobileMoreSheet
                    isPremium={!!isPremium}
                    isAdmin={isAdmin}
                    feedbackNew={feedbackNew}
                    onClose={() => setMoreOpen(false)}
                    onPremium={() => setPremiumOpen(true)}
                    onInvite={() => setInviteOpen(true)}
                    onShare={() => setShareOpen(true)}
                    onReportBug={() => setBugOpen(true)}
                    onAdmin={() => router.push("/admin")}
                    onTripInfo={() => setInfoOpen(true)}
                  />
                )}
              </AnimatePresence>
            </div>
            <ParticipantAvatars large />
          </div>
        </div>

        <nav className="mx-auto max-w-7xl px-2 sm:px-4 pb-1.5 relative">
          <div
            className="flex gap-1 overflow-x-auto no-scrollbar chip-snap scroll-smooth"
            ref={tabScrollRef}
            onScroll={handleTabScroll}
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.key;
              const badge = getTabBadge(t.key, trip);
              return (
                <button
                  key={t.key}
                  type="button"
                  data-tab={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 min-h-11 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 active:scale-95 shrink-0",
                    active
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="tab-bg"
                      className="absolute inset-0 rounded-xl bg-primary shadow-md shadow-primary/30"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon className={cn("size-4 relative z-10", active && "scale-110")} />
                  <span className="relative z-10">{t.label}</span>
                  {badge !== null && (
                    <span
                      className={cn(
                        "relative z-10 ml-0.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold grid place-items-center",
                        active ? "bg-white/25 text-white" : "bg-primary/15 text-primary"
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {showLeftArrow && (
            <>
              <div className="pointer-events-none absolute left-0 top-0 bottom-1.5 w-12 bg-gradient-to-r from-background via-background/80 to-transparent z-10" />
              <button
                onClick={() => tabScrollRef.current?.scrollBy({ left: -200, behavior: "smooth" })}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-20 hidden sm:grid size-11 rounded-full bg-primary/90 backdrop-blur text-primary-foreground shadow-lg place-items-center active:scale-90"
                aria-label="Влево"
              >
                <ChevronLeft className="size-5" />
              </button>
            </>
          )}
          {showRightArrow && (
            <>
              <div className="pointer-events-none absolute right-0 top-0 bottom-1.5 w-12 bg-gradient-to-l from-background via-background/80 to-transparent z-10" />
              <button
                onClick={() => tabScrollRef.current?.scrollBy({ left: 200, behavior: "smooth" })}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-20 hidden sm:grid size-11 rounded-full bg-primary/90 backdrop-blur text-primary-foreground shadow-lg place-items-center active:scale-90"
                aria-label="Вправо"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </nav>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-4 py-4 pb-28 sm:pb-10 relative z-0 safe-bottom">
        {children}
      </main>

      <motion.button
        onClick={() => setQuickOpen(true)}
        whileTap={{ scale: 0.88 }}
        whileHover={{ scale: 1.06 }}
        className="fixed z-40 size-16 sm:size-14 rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-2xl shadow-orange-500/40 grid place-items-center border-2 border-white/20 right-4 sm:right-6"
        style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
        aria-label="Быстрое добавление"
      >
        <motion.div
          className="absolute inset-0 rounded-full bg-orange-500"
          animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
        <Plus className="size-8 sm:size-7 relative z-10" strokeWidth={2.5} />
      </motion.button>

      <footer className="mt-auto border-t border-border bg-card/30 pb-safe">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium">TripTrek</span>
          {trip ? (
            <>
              <span className="opacity-40">·</span>
              <span className="truncate max-w-[60vw]">{trip.settings.title}</span>
              <span className="opacity-40">·</span>
              <span>{trip.settings.totalDays} дн.</span>
            </>
          ) : (
            <>
              <span className="opacity-40">·</span>
              <span>планируй путешествия легко</span>
            </>
          )}
        </div>
      </footer>

      <QuickAddSheet open={quickOpen} onOpenChange={setQuickOpen} />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <InviteFriends open={inviteOpen} onOpenChange={setInviteOpen} />
      <TripInfoSheet
        open={infoOpen}
        onOpenChange={setInfoOpen}
        onInvite={() => setInviteOpen(true)}
        onShare={() => setShareOpen(true)}
      />
      <ShareCard open={shareOpen} onOpenChange={setShareOpen} />
      <PremiumModal open={premiumOpen} onOpenChange={setPremiumOpen} />
      <BugReportSheet open={bugOpen} onOpenChange={setBugOpen} />
      <PWAUpdateNotification />
    </div>
  );
}

/** Мобильное меню «Ещё»: bottom sheet с крупными зонами касания и переключателем темы */
function MobileMoreSheet({
  isPremium,
  isAdmin,
  feedbackNew,
  onClose,
  onPremium,
  onInvite,
  onShare,
  onReportBug,
  onAdmin,
  onTripInfo,
}: {
  isPremium: boolean;
  isAdmin: boolean;
  feedbackNew: number;
  onClose: () => void;
  onPremium: () => void;
  onInvite: () => void;
  onShare: () => void;
  onReportBug: () => void;
  onAdmin: () => void;
  onTripInfo: () => void;
}) {
  const { theme, setTheme } = useTheme();
  if (typeof document === "undefined") return null;
  const themeOptions = [
    { value: "light", label: "Светлая", icon: Sun },
    { value: "dark", label: "Тёмная", icon: Moon },
    { value: "system", label: "Авто", icon: Monitor },
  ] as const;
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-xs rounded-t-3xl sm:rounded-3xl overflow-hidden pb-[env(safe-area-inset-bottom)]"
        >
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="px-4 pt-2 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Тема</span>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5 p-1 rounded-2xl bg-muted">
              {themeOptions.map((o) => {
                const Icon = o.icon;
                const active = (theme ?? "system") === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setTheme(o.value)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 min-h-14 rounded-xl text-[11px] font-semibold transition-all",
                      active ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-pressed={active}
                  >
                    <Icon className="size-4" />
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-2">
            <MoreItem
              icon={<Info className="size-4" />}
              label="О поездке"
              onClick={() => {
                onClose();
                onTripInfo();
              }}
            />
            <MoreItem
              icon={<Bug className="size-4" />}
              label="Сообщить о проблеме"
              onClick={() => {
                onClose();
                onReportBug();
              }}
            />
            {isAdmin && (
              <MoreItem
                icon={<Shield className="size-4" />}
                label={feedbackNew > 0 ? `Админ-панель · ${feedbackNew} нов.` : "Админ-панель"}
                onClick={() => {
                  onClose();
                  onAdmin();
                }}
              />
            )}
            <MoreItem
              icon={<UserPlus className="size-4" />}
              label="Пригласить друзей"
              onClick={() => {
                onClose();
                onInvite();
              }}
            />
            <MoreItem
              icon={<Share2 className="size-4" />}
              label="Карточка поездки"
              onClick={() => {
                onClose();
                onShare();
              }}
            />
            <MoreItem
              icon={<Crown className="size-4" />}
              label={isPremium ? "Premium активен ✓" : "Premium — больше лимитов"}
              onClick={() => {
                onClose();
                onPremium();
              }}
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

function HeaderIconBtn({
  children,
  onClick,
  label,
  className,
  large,
  ...rest
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  className?: string;
  large?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-full grid place-items-center bg-secondary border border-border hover:bg-accent transition-colors shrink-0",
        large ? "size-11" : "size-9 sm:size-8",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function MoreItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 min-h-11 text-sm text-left hover:bg-accent transition-colors"
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}

function ParticipantAvatars({ large }: { large?: boolean }) {
  const { data: trip } = useTrip();
  const { setCurrentUserId } = useTripStore();
  const { data: session } = useSession();
  const router = useRouter();
  if (!trip) return null;

  const size = large ? "size-11" : "size-9 sm:size-8";
  const authedUser = session?.user;
  if (authedUser) {
    const current = trip.participants.find((p) => p.id === (authedUser as { id?: string }).id);
    return (
      <div className="flex items-center gap-1.5">
        {current && (
          <button
            onClick={() => router.push("/profile")}
            title={`${current.name} — профиль`}
            aria-label="Профиль"
            className={cn(size, "rounded-full grid place-items-center text-sm border-2 border-background ring-2 ring-primary shrink-0")}
            style={{ background: current.color }}
          >
            <span>{current.emoji}</span>
          </button>
        )}
      </div>
    );
  }

  const current = trip.participants.find((p) => p.id === trip.settings.currentUserId) || trip.participants[0];

  return (
    <div className="flex items-center -space-x-2">
      {trip.participants.map((p) => {
        const isCurrent = p.id === current?.id;
        return (
          <button
            key={p.id}
            onClick={() => setCurrentUserId(p.id)}
            title={p.name}
            className={cn(
              size,
              "rounded-full grid place-items-center text-sm border-2 transition-transform",
              isCurrent ? "border-background ring-2 ring-primary z-10" : "border-background opacity-70"
            )}
            style={{ background: p.color }}
          >
            <span>{p.emoji}</span>
          </button>
        );
      })}
    </div>
  );
}

function ThemeToggle() {
  const { setTheme } = useTheme();
  const toggle = () => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "light" : "dark");
  };
  return (
    <HeaderIconBtn onClick={toggle} label="Сменить тему">
      <Sun className="size-4 hidden dark:block" />
      <Moon className="size-4 block dark:hidden" />
    </HeaderIconBtn>
  );
}

function getTabBadge(key: string, trip: ReturnType<typeof useTrip>["data"]): number | null {
  if (!trip) return null;
  switch (key) {
    case "itinerary": {
      const unvisited = trip.totalPlaces - trip.visitedPlaces;
      return unvisited > 0 ? unvisited : null;
    }
    case "gallery":
      return trip.totalPhotos > 0 ? trip.totalPhotos : null;
    case "journal":
      return trip.totalJournals > 0 ? trip.totalJournals : null;
    default:
      return null;
  }
}
