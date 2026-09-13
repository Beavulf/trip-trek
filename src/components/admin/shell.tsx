"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  Bot,
  ChevronLeft,
  LayoutDashboard,
  Loader2,
  Map,
  MessagesSquare,
  Moon,
  ScrollText,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminStats } from "@/hooks/use-admin-stats";
import { UserAvatar } from "@/components/trip/user-avatar";
import { cn } from "@/lib/utils";
import { SECTION_COLOR, Stamp } from "./shared";

// Штаб TripTrek: на ПК — постоянный сайдбар с разделами, на мобиле — липкая
// шапка + чип-рейл (как в остальном приложении). Гейт по isAdmin — только UX;
// настоящая граница — requireAdmin в каждом /api/admin/* роуте.

export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Обзор", icon: LayoutDashboard, key: "overview" },
  { href: "/admin/users", label: "Юзеры", icon: Users, key: "users" },
  { href: "/admin/trips", label: "Поездки", icon: Map, key: "trips" },
  { href: "/admin/ai", label: "ИИ", icon: Bot, key: "ai" },
  { href: "/admin/feedback", label: "Отзывы", icon: MessagesSquare, key: "feedback" },
  { href: "/admin/journal", label: "Журнал", icon: ScrollText, key: "journal" },
  { href: "/admin/settings", label: "Настройки", icon: Settings, key: "settings" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label="Сменить тему"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="size-9 rounded-xl grid place-items-center bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors"
    >
      {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useAuth();

  const userId = session?.user?.id || "";
  const isAdmin = session?.user?.isAdmin === true;

  // Бейдж вкладки и карточки едят один кэш
  const { data: stats } = useAdminStats(status === "authenticated" && isAdmin);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated" || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-3 max-w-xs">
          <div className="text-5xl">🔒</div>
          <h1 className="font-bold text-lg">Доступ только для админов</h1>
          <p className="text-sm text-muted-foreground">
            Это служебная панель TripTrek. Если считаешь, что это ошибка — напиши владельцу.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Вернуться в приложение
          </button>
        </div>
      </div>
    );
  }

  const active = ADMIN_SECTIONS.find((s) => isActive(pathname, s.href)) || ADMIN_SECTIONS[0];
  const feedbackNew = stats?.feedback.new ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* === Сайдбар (ПК) === */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[264px] z-30 flex-col border-r border-border/80 bg-card/40 glass">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border/60">
          <span className="text-2xl leading-none">🛂</span>
          <div className="leading-tight">
            <div className="font-black tracking-tight">TripTrek</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">штаб · v{stats?.health.version ?? "…"}</div>
          </div>
          <Stamp label="Admin" color="#ef4444" className="ml-auto" />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {ADMIN_SECTIONS.map((s) => {
            const Icon = s.icon;
            const on = isActive(pathname, s.href);
            const badge = s.key === "feedback" && feedbackNew > 0 ? feedbackNew : null;
            return (
              <Link
                key={s.href}
                href={s.href}
                className={cn(
                  "relative flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-medium transition-colors",
                  on ? "text-foreground bg-accent" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <span
                  className={cn("absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full transition-opacity", on ? "opacity-100" : "opacity-0")}
                  style={{ background: SECTION_COLOR[s.key] }}
                />
                <Icon className={cn("size-4.5 shrink-0", on ? "" : "opacity-70")} style={on ? { color: SECTION_COLOR[s.key] } : undefined} />
                <span className="flex-1">{s.label}</span>
                {badge !== null && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold grid place-items-center">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Паспорт админа */}
        <div className="px-3 pb-4 space-y-2">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 p-3">
            <UserAvatar
              name={session?.user?.name || "Админ"}
              emoji={session?.user?.emoji || "👤"}
              color={session?.user?.color || "#f97316"}
              avatarUrl={session?.user?.avatarUrl || null}
              className="size-10 text-lg border-2 border-background"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{session?.user?.name || "Админ"}</div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground truncate">
                {session?.user?.email}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="flex-1 min-h-10 inline-flex items-center justify-center gap-1.5 rounded-xl bg-secondary border border-border text-xs font-medium hover:bg-accent transition-colors"
            >
              <ChevronLeft className="size-3.5" />
              В приложение
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* === Мобильная шапка + чипы === */}
      <header className="lg:hidden sticky top-0 z-40 glass-strong border-b border-border/80 pt-[env(safe-area-inset-top)]">
        <div className="px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="Назад"
            className="size-11 rounded-full grid place-items-center bg-secondary border border-border hover:bg-accent transition-colors"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="font-bold text-base flex items-center gap-2">
            Штаб
            <Stamp label="Admin" color="#ef4444" />
          </h1>
          <div className="w-11 grid place-items-center">
            <ThemeToggle />
          </div>
        </div>

        <nav className="px-4 pb-1.5">
          <div className="flex gap-1 overflow-x-auto no-scrollbar chip-snap">
            {ADMIN_SECTIONS.map((s) => {
              const Icon = s.icon;
              const on = isActive(pathname, s.href);
              const badge = s.key === "feedback" && feedbackNew > 0 ? feedbackNew : null;
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 min-h-10 rounded-xl text-sm font-medium whitespace-nowrap transition-all active:scale-95 shrink-0",
                    on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  )}
                >
                  {on && (
                    <motion.div
                      layoutId="admin-tab-bg"
                      className="absolute inset-0 rounded-xl bg-primary shadow-md shadow-primary/30"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon className="size-4 relative z-10" />
                  <span className="relative z-10">{s.label}</span>
                  {badge !== null && (
                    <span
                      className={cn(
                        "relative z-10 ml-0.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold grid place-items-center",
                        on ? "bg-white/25 text-white" : "bg-amber-500/20 text-amber-500"
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {/* === Контент === */}
      <div className="lg:pl-[264px]">
        {/* Заголовок раздела на ПК */}
        <div className="hidden lg:flex items-center gap-3 px-8 pt-8">
          <active.icon className="size-5" style={{ color: SECTION_COLOR[active.key] }} />
          <h1 className="text-xl font-bold">{active.label}</h1>
        </div>
        <main className="mx-auto max-w-3xl lg:max-w-6xl px-4 lg:px-8 py-4 lg:py-6 pb-24 space-y-4">
          {children}
          <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 pt-1">
            TripTrek · служба контроля
          </p>
        </main>
      </div>
    </div>
  );
}
