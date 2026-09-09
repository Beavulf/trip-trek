"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { PieChart as PieIcon, BarChart3 } from "lucide-react";
import { cn, plural } from "@/lib/utils";

interface CategorySlice {
  key: string;
  label: string;
  emoji: string;
  color: string;
  value: number;
}

interface DailySlice {
  day: string;
  amount: number;
  city: string;
}

interface BudgetAnalyticsProps {
  byCategory: CategorySlice[];
  dailyData: DailySlice[];
  totalSpent: number;
  dayColor: (city: string) => string;
  currencySymbol: string;
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
} as const;

// Обе диаграммы в одной карточке с табами — вместо двух отдельных секций
export function BudgetAnalytics({ byCategory, dailyData, totalSpent, dayColor, currencySymbol: sym }: BudgetAnalyticsProps) {
  const hasCategories = byCategory.length > 0;
  const hasDays = dailyData.length > 0;
  const [tab, setTab] = useState<"cats" | "days">(hasCategories ? "cats" : "days");

  if (!hasCategories && !hasDays) return null;

  const avgDay = Math.round(dailyData.reduce((s, d) => s + d.amount, 0) / dailyData.length);

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-semibold text-sm">Аналитика</h2>
        <div className="ml-auto grid grid-cols-2 gap-0.5 bg-muted rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setTab("cats")}
            disabled={!hasCategories}
            className={cn(
              "flex items-center gap-1 px-2.5 min-h-8 rounded-md text-xs font-medium transition-colors disabled:opacity-40",
              tab === "cats" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <PieIcon className="size-3.5" /> Категории
          </button>
          <button
            type="button"
            onClick={() => setTab("days")}
            disabled={!hasDays}
            className={cn(
              "flex items-center gap-1 px-2.5 min-h-8 rounded-md text-xs font-medium transition-colors disabled:opacity-40",
              tab === "days" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BarChart3 className="size-3.5" /> По дням
          </button>
        </div>
      </div>

      {tab === "cats" && hasCategories && (
        <div className="flex items-center gap-4">
          <div className="w-32 h-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="value" cx="50%" cy="50%" innerRadius={32} outerRadius={60} paddingAngle={2}>
                  {byCategory.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [`${sym}${v.toFixed(0)}`, ""]}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "var(--foreground)" }}
                  itemStyle={{ color: "var(--foreground)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            {[...byCategory].sort((a, b) => b.value - a.value).map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="text-base">{c.emoji}</span>
                <span className="flex-1 truncate text-muted-foreground">{c.label}</span>
                <span className="font-semibold">{sym}{c.value.toFixed(0)}</span>
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {totalSpent > 0 ? `${((c.value / totalSpent) * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "days" && hasDays && (
        <>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  formatter={(v: number) => [`${sym}${v}`, "Потрачено"]}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "var(--foreground)" }}
                  itemStyle={{ color: "var(--foreground)" }}
                  cursor={{ fill: "var(--accent)" }}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={40}>
                  {dailyData.map((entry, i) => (
                    <Cell key={i} fill={dayColor(entry.city)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Всего {dailyData.length} {plural(dailyData.length, "день", "дня", "дней")} с тратами · средний день: {sym}
            {avgDay}
          </p>
        </>
      )}
    </div>
  );
}
