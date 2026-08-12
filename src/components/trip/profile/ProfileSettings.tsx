"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Bell, Crown, Info, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import type { UserProfile } from "./types";
import { PushToggle } from "./PushToggle";

interface ProfileSettingsProps {
  profile: UserProfile;
  setPremiumOpen: (v: boolean) => void;
}

export function ProfileSettings({ profile, setPremiumOpen }: ProfileSettingsProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && (theme === "dark" || (theme === "system" && resolvedTheme === "dark"));
  const themeLabel = !mounted
    ? "…"
    : theme === "system"
      ? "Системная"
      : isDark
        ? "Тёмная"
        : "Светлая";

  return (
    <motion.div
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
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-accent/50 transition-colors min-h-11"
        >
          <div className="size-9 rounded-xl bg-secondary grid place-items-center">
            {isDark ? <Moon className="size-4.5" /> : <Sun className="size-4.5" />}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">Тема оформления</div>
            <div className="text-xs text-muted-foreground">{themeLabel}</div>
          </div>
          <div className={cn("w-11 h-6 rounded-full relative transition-colors", isDark ? "bg-primary" : "bg-muted")}>
            <div
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                isDark ? "translate-x-5" : "translate-x-0.5"
              )}
            />
          </div>
        </button>

        {/* Premium / Подписка */}
        <button
          onClick={() => setPremiumOpen(true)}
          className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-accent/50 transition-colors"
        >
          <div className={cn(
            "size-9 rounded-xl grid place-items-center",
            profile.isPremium ? "bg-gradient-to-br from-amber-500 to-orange-500" : "bg-secondary"
          )}>
            <Crown className={cn("size-4.5", profile.isPremium ? "text-white" : "text-muted-foreground")} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">Подписка</div>
            <div className="text-xs text-muted-foreground">
              {profile.isPremium
                ? `Premium · до ${profile.planExpiry ? new Date(profile.planExpiry).toLocaleDateString("ru-RU") : ""}`
                : "Free план · обновить →"}
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground" />
        </button>

        {/* Push-уведомления */}
        <div className="flex items-center gap-3 p-3.5">
          <div className="size-9 rounded-xl bg-secondary grid place-items-center">
            <Bell className="size-4.5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">Push-уведомления</div>
            <div className="text-xs text-muted-foreground">Оповещения о поездках</div>
          </div>
          <PushToggle />
        </div>

        {/* О приложении */}
        <div className="flex items-center gap-3 p-3.5">
          <div className="size-9 rounded-xl bg-secondary grid place-items-center">
            <Info className="size-4.5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">TripTrek</div>
            <div className="text-xs text-muted-foreground">Версия 0.2.16 · TripTrek</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
