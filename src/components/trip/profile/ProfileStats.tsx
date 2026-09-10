"use client";

import { motion } from "framer-motion";
import { IdCard } from "lucide-react";
import type { UserProfile } from "./types";

/** «Личное дело» — страница данных в духе паспортной, с пунктирными лидерами */
export function ProfileStats({ profile }: { profile: UserProfile }) {
  const cells: { label: string; value: string }[] = [
    { label: "Поездок", value: String(profile.stats.trips) },
    { label: "Фото", value: String(profile.stats.photos) },
    { label: "Мест", value: String(profile.stats.visitedPlaces) },
    { label: "Записей", value: String(profile.stats.journals) },
    { label: "Сообщений", value: String(profile.stats.messages) },
    { label: "Потрачено", value: `$${(profile.stats.totalSpent ?? 0).toFixed(0)}` },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="rounded-2xl bg-card border border-border overflow-hidden"
      aria-label="Статистика"
    >
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <IdCard className="size-4 text-muted-foreground" />
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Личное дело
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border">
        {cells.map((c) => (
          <div key={c.label} className="bg-card px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{c.label}</span>
              <span className="flex-1 border-b border-dotted border-muted-foreground/40 translate-y-[-3px]" aria-hidden />
              <span className="text-base font-bold tabular-nums">{c.value}</span>
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
