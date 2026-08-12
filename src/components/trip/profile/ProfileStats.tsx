"use client";

import { motion } from "framer-motion";
import { BookOpen, Images, MapPin, MessagesSquare, Plane, Wallet } from "lucide-react";
import type { UserProfile } from "./types";

export function ProfileStats({ profile }: { profile: UserProfile }) {
  const stats = [
    { icon: Plane, label: "Поездок", value: profile.stats.trips, color: "#06b6d4" },
    { icon: Images, label: "Фото", value: profile.stats.photos, color: "#8b5cf6" },
    { icon: Wallet, label: "Потрачено", value: `$${(profile.stats.totalSpent ?? 0).toFixed(0)}`, color: "#10b981" },
    { icon: BookOpen, label: "Записей", value: profile.stats.journals, color: "#f59e0b" },
    { icon: MessagesSquare, label: "Сообщений", value: profile.stats.messages, color: "#ec4899" },
    { icon: MapPin, label: "Мест", value: profile.stats.visitedPlaces, color: "#ef4444" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="grid grid-cols-3 gap-2"
    >
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.label} className="rounded-2xl bg-card border border-border p-3 text-center">
            <div
              className="size-9 mx-auto rounded-xl grid place-items-center mb-1.5"
              style={{ background: `${s.color}22` }}
            >
              <Icon className="size-4.5" style={{ color: s.color }} />
            </div>
            <div className="text-lg font-bold tabular-nums">{s.value}</div>
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
          </div>
        );
      })}
    </motion.div>
  );
}

// Лимиты Free-плана (показываем только для free-пользователей)
export function FreemiumLimits({ profile }: { profile: UserProfile }) {
  if (profile.isPremium || !profile.limits) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 }}
      className="rounded-2xl bg-muted/50 border border-border p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="size-4 text-muted-foreground">ℹ️</span>
        <h3 className="font-semibold text-sm">Твой Free план</h3>
      </div>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Создание поездок</span>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {Array.from({ length: 1 }).map((_, i) => (
                <div key={i} className={
                  i < profile.stats.ownedTrips ? "h-1.5 w-6 rounded-full bg-primary" : "h-1.5 w-6 rounded-full bg-muted-foreground/20"
                } />
              ))}
            </div>
            <span className="font-medium tabular-nums">
              {profile.stats.ownedTrips} / {profile.limits.maxOwnedTrips}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Участников в поездке</span>
          <span className="font-medium">{profile.limits.maxMembersPerTrip} макс</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Участие в чужих поездках</span>
          <span className="font-medium text-green-600">Безлимит ✅</span>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          💡 Ты можешь быть приглашён в любое количество поездок друзей без лимита.
          Лимит 1 поездка действует только на поездки, которые ты <b>создаёшь сам</b>.
        </p>
      </div>
    </motion.div>
  );
}
