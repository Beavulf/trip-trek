"use client";

import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Map, Image, ReceiptText, MapPin, Crown, Bug } from "lucide-react";
import { plural } from "@/lib/utils";
import type { AdminStats } from "@/hooks/use-admin-stats";

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
} as const;

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
}

export function OverviewTab({ stats }: { stats: AdminStats }) {
  const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  const contentCards = [
    { icon: Map, label: "Поездки", value: stats.trips },
    { icon: MapPin, label: "Места", value: stats.places },
    { icon: Image, label: "Фото", value: stats.photos },
    { icon: ReceiptText, label: "Траты", value: stats.expenses },
  ];

  const maxReg = Math.max(1, ...stats.registrations14d.map((d) => d.count));

  return (
    <div className="space-y-4">
      {/* Сводка журнала: кто в системе и что требует внимания */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl p-5 text-white bg-gradient-to-br from-primary via-primary to-[#1c1917]"
      >
        <span className="absolute -right-4 -bottom-8 text-[9rem] leading-none opacity-10 select-none" aria-hidden>
          🛂
        </span>
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/70">
          TripTrek · сводка · {today}
        </p>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-5xl font-black leading-none tabular-nums">{stats.users}</span>
          <span className="text-sm text-white/80 pb-1">
            {plural(stats.users, "аккаунт", "аккаунта", "аккаунтов")} в системе
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur">
            +{stats.usersNew7d} за неделю
          </span>
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur inline-flex items-center gap-1">
            <Crown className="size-3" /> {stats.premium} premium
          </span>
          {stats.feedback.new > 0 && (
            <span className="rounded-full bg-amber-400/90 px-2.5 py-1 text-xs font-bold text-amber-950 inline-flex items-center gap-1">
              <Bug className="size-3" /> {stats.feedback.new}{" "}
              {plural(stats.feedback.new, "новый отзыв", "новых отзыва", "новых отзывов")}
            </span>
          )}
        </div>
      </motion.section>

      {/* Учётные карточки контента */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
      >
        {contentCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-2xl bg-card border border-border p-3.5">
              <Icon className="size-4 text-muted-foreground" />
              <div className="mt-2 text-2xl font-black tabular-nums leading-none">{c.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{c.label}</div>
            </div>
          );
        })}
      </motion.section>

      {/* Регистрации за 14 дней */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className="rounded-2xl bg-card border border-border p-4"
      >
        <h2 className="font-semibold text-sm">Регистрации · 14 дней</h2>
        <div className="h-44 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.registrations14d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={dayLabel}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={18}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, maxReg]}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={24}
              />
              <Tooltip
                formatter={(v: number) => [v, "Регистраций"]}
                labelFormatter={(l: string) => dayLabel(l)}
                contentStyle={tooltipStyle}
                labelStyle={{ color: "var(--foreground)" }}
                itemStyle={{ color: "var(--foreground)" }}
                cursor={{ fill: "var(--accent)" }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={28}>
                {stats.registrations14d.map((entry, i) => (
                  <Cell key={i} fill={entry.count > 0 ? "var(--primary)" : "var(--muted)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-2">
          счёт по датам UTC
        </p>
      </motion.section>
    </div>
  );
}
