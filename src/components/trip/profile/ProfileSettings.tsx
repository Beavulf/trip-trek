"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Bell, Bug, Crown, Monitor, Moon, Settings, Shield, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import type { UserProfile } from "./types";
import { PushToggle } from "./PushToggle";

interface ProfileSettingsProps {
  profile: UserProfile;
  setPremiumOpen: (v: boolean) => void;
  onReportBug: () => void;
  isAdmin: boolean;
  feedbackNew: number;
}

const THEME_OPTIONS = [
  { value: "system", icon: Monitor, label: "Системная" },
  { value: "light", icon: Sun, label: "Светлая" },
  { value: "dark", icon: Moon, label: "Тёмная" },
] as const;

export function ProfileSettings({ profile, setPremiumOpen, onReportBug, isAdmin, feedbackNew }: ProfileSettingsProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme ?? "system") : "system";
  const currentLabel = THEME_OPTIONS.find((t) => t.value === current)?.label ?? "Системная";

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl bg-card border border-border overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Settings className="size-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Настройки</h3>
      </div>

      <div className="divide-y divide-border">
        {/* Тема — сегментированный переключатель */}
        <div className="flex items-center gap-3 p-3.5">
          <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
            {current === "dark" ? <Moon className="size-4.5" /> : current === "light" ? <Sun className="size-4.5" /> : <Monitor className="size-4.5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Тема</div>
            <div className="text-xs text-muted-foreground">{mounted ? currentLabel : "…"}</div>
          </div>
          <div
            role="radiogroup"
            aria-label="Тема оформления"
            className="flex gap-1 rounded-xl bg-muted p-1 shrink-0"
          >
            {THEME_OPTIONS.map((t) => {
              const Icon = t.icon;
              const active = current === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={t.label}
                  title={t.label}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    "size-10 rounded-lg grid place-items-center transition-all",
                    active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Подписка */}
        <button
          type="button"
          onClick={() => setPremiumOpen(true)}
          className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-accent/50 transition-colors"
        >
          <div
            className={cn(
              "size-9 rounded-xl grid place-items-center shrink-0",
              profile.isPremium ? "bg-gradient-to-br from-amber-500 to-orange-500" : "bg-secondary"
            )}
          >
            <Crown className={cn("size-4.5", profile.isPremium ? "text-white" : "text-muted-foreground")} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Подписка</div>
            <div className="text-xs text-muted-foreground">
              {profile.isPremium
                ? `Premium · до ${profile.planExpiry ? new Date(profile.planExpiry).toLocaleDateString("ru-RU") : "∞"}`
                : "Free план — расширить лимиты"}
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground shrink-0" />
        </button>

        {/* Push-уведомления */}
        <div className="flex items-center gap-3 p-3.5">
          <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
            <Bell className="size-4.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Push-уведомления</div>
            <div className="text-xs text-muted-foreground">Оповещения о поездках</div>
          </div>
          <PushToggle />
        </div>

        {/* Сообщить о проблеме */}
        <button
          type="button"
          onClick={onReportBug}
          className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-accent/50 transition-colors"
        >
          <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
            <Bug className="size-4.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Сообщить о проблеме</div>
            <div className="text-xs text-muted-foreground">Баг, идея или вопрос</div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground shrink-0" />
        </button>

        {/* Админ-панель — только для роли admin */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-accent/50 transition-colors"
          >
            <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
              <Shield className="size-4.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Админ-панель</div>
              <div className="text-xs text-muted-foreground">Юзеры, поездки, отзывы</div>
            </div>
            {feedbackNew > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold grid place-items-center shrink-0">
                {feedbackNew}
              </span>
            )}
            <ArrowRight className="size-4 text-muted-foreground shrink-0" />
          </button>
        )}

        {/* Версия */}
        <div className="flex items-center gap-3 p-3.5">
          <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
            <span className="text-base">🧳</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">TripTrek</div>
            <div className="text-xs text-muted-foreground">Версия 0.2.16</div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
