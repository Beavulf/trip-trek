"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, LayoutDashboard, Loader2, Map, MessagesSquare, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminStats } from "@/hooks/use-admin-stats";
import { cn } from "@/lib/utils";
import { OverviewTab } from "./OverviewTab";
import { UsersTab } from "./UsersTab";
import { TripsTab } from "./TripsTab";
import { FeedbackTab } from "./FeedbackTab";
import { Stamp, type FeedbackStatus } from "./shared";

type AdminTab = "overview" | "users" | "trips" | "feedback";

const TABS = [
  { key: "overview", label: "Обзор", icon: LayoutDashboard },
  { key: "users", label: "Юзеры", icon: Users },
  { key: "trips", label: "Поездки", icon: Map },
  { key: "feedback", label: "Отзывы", icon: MessagesSquare },
] as const;

export function AdminPage() {
  const router = useRouter();
  const { data: session, status } = useAuth();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackStatus | "all">("new");

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

  // Настоящая граница — requireAdmin в каждом /api/admin/* роуте;
  // эта заглушка только для UX
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

  const feedbackNew = stats?.feedback.new ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass-strong border-b border-border/80 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="Назад"
            className="size-11 rounded-full grid place-items-center bg-secondary border border-border hover:bg-accent transition-colors"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="font-bold text-base flex items-center gap-2">
            Админ-панель
            <Stamp label="Admin" color="#ef4444" />
          </h1>
          <div className="w-11" />
        </div>

        {/* Вкладки */}
        <nav className="mx-auto max-w-3xl px-4 pb-1.5">
          <div className="flex gap-1 overflow-x-auto no-scrollbar chip-snap">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              const badge = t.key === "feedback" && feedbackNew > 0 ? feedbackNew : null;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 min-h-10 rounded-xl text-sm font-medium whitespace-nowrap transition-all active:scale-95 shrink-0",
                    active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="admin-tab-bg"
                      className="absolute inset-0 rounded-xl bg-primary shadow-md shadow-primary/30"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon className="size-4 relative z-10" />
                  <span className="relative z-10">{t.label}</span>
                  {badge !== null && (
                    <span
                      className={cn(
                        "relative z-10 ml-0.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold grid place-items-center",
                        active ? "bg-white/25 text-white" : "bg-amber-500/20 text-amber-500"
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 pb-24 space-y-4">
        {tab === "overview" &&
          (stats ? (
            <OverviewTab stats={stats} />
          ) : (
            <div className="flex justify-center py-20">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ))}
        {tab === "users" && <UsersTab selfId={userId} />}
        {tab === "trips" && <TripsTab />}
        {tab === "feedback" && (
          <FeedbackTab statusFilter={feedbackFilter} onFilterChange={setFeedbackFilter} counts={stats?.feedback || { new: 0, inProgress: 0, resolved: 0 }} />
        )}

        <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 pt-1">
          TripTrek · служба контроля
        </p>
      </main>
    </div>
  );
}
