"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Plus, X, TrendingDown, BarChart3, UserCircle, Pencil, Loader2 } from "lucide-react";
import { useExpenses, useTrip } from "@/hooks/use-trip";
import { EXPENSE_CATEGORIES, CITIES } from "@/lib/types";
import { calculateBalances, calculateSettlements } from "@/lib/budget";
import { cn } from "@/lib/utils";
import { CurrencyConverter } from "../currency-converter";
import { BudgetPlanWidget } from "../budget-plan-widget";
import { BudgetHero } from "./BudgetHero";
import { ExpenseRow } from "./ExpenseRow";
import { AddExpenseForm } from "./AddExpenseForm";
import { ParticipantBudgetRow } from "./ParticipantBudgetRow";
import { BudgetEditModal } from "./BudgetEditModal";
import { SettlementSection } from "./SettlementSection";

export function Budget() {
  const { data: expenses, isLoading: expensesLoading, error: expensesError } = useExpenses();
  const { data: trip, isLoading: tripLoading, error: tripError } = useTrip();
  const [showAdd, setShowAdd] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);

  // P0 #4: нет trip / ошибка → показываем осмысленное сообщение, а не вечный «Загрузка…»
  if (tripError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <p className="text-xs">Возможно поездка удалена или нет доступа</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (expensesError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">💸</div>
        <p className="text-sm font-medium">Не удалось загрузить траты</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (tripLoading || expensesLoading || !expenses || !trip) {
    return <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Загрузка бюджета…</div>;
  }

  // Единый фильтр реальных трат (P1 #5) — settlement исключён везде
  const realExpenses = expenses.filter((e) => e.category !== "settlement");
  const settlementCount = expenses.length - realExpenses.length;
  const totalSpent = realExpenses.reduce((s, e) => s + e.amount, 0);
  const remaining = trip.settings.totalBudget - totalSpent;
  const budgetPct = trip.settings.totalBudget > 0 ? (totalSpent / trip.settings.totalBudget) * 100 : 0;

  // По категориям (без переводов)
  const byCategory = Object.keys(EXPENSE_CATEGORIES).map((key) => {
    const sum = realExpenses.filter((e) => e.category === key).reduce((s, e) => s + e.amount, 0);
    return { key, label: EXPENSE_CATEGORIES[key].label, emoji: EXPENSE_CATEGORIES[key].emoji, color: EXPENSE_CATEGORIES[key].color, value: sum };
  }).filter((x) => x.value > 0);

  const balances = calculateBalances(expenses, trip.participants);
  const settlements = calculateSettlements(expenses, trip.participants);

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Hero budget — с редактированием общего бюджета */}
      <BudgetHero
        totalSpent={totalSpent}
        totalBudget={trip.settings.totalBudget}
        budgetPct={budgetPct}
        remaining={remaining}
      />

      {/* График по категориям */}
      {byCategory.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><TrendingDown className="size-4" /> По категориям</h2>
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
                    formatter={(v: number) => [`$${v.toFixed(0)}`, ""]}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }}
                    labelStyle={{ color: "var(--foreground)" }}
                    itemStyle={{ color: "var(--foreground)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5 min-w-0">
              {byCategory.sort((a, b) => b.value - a.value).map((c) => (
                <div key={c.key} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="text-base">{c.emoji}</span>
                  <span className="flex-1 truncate text-muted-foreground">{c.label}</span>
                  <span className="font-semibold">${c.value.toFixed(0)}</span>
                  <span className="text-xs text-muted-foreground w-10 text-right">{((c.value / totalSpent) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* График тренда по дням */}
      {(() => {
        const dailyData = trip.days.map((d) => {
          const dayExpenses = realExpenses.filter((e) => e.dayId === d.id);
          const sum = dayExpenses.reduce((s, e) => s + e.amount, 0);
          return {
            day: `Д${d.dayNumber}`,
            amount: Math.round(sum),
            city: d.city,
          };
        }).filter((d) => d.amount > 0);

        if (dailyData.length === 0) return null;

        const maxAmount = Math.max(...dailyData.map((d) => d.amount), 1);

        return (
          <div className="rounded-2xl bg-card border border-border p-4">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><BarChart3 className="size-4" /> Траты по дням</h2>
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
                    formatter={(v: number) => [`$${v}`, "Потрачено"]}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }}
                    labelStyle={{ color: "var(--foreground)" }}
                    itemStyle={{ color: "var(--foreground)" }}
                    cursor={{ fill: "var(--accent)" }}
                  />
                  <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {dailyData.map((entry, i) => {
                      const city = CITIES.find((c) => c.name === entry.city);
                      return <Cell key={i} fill={city?.color ?? "#f97316"} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Всего {dailyData.length} дней с тратами · средний день: ${Math.round(dailyData.reduce((s, d) => s + d.amount, 0) / dailyData.length)}
            </p>
          </div>
        );
      })()}

      {/* План vs Факт по категориям */}
      <BudgetPlanWidget />

      {/* Персональные бюджеты */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm flex items-center gap-2"><UserCircle className="size-4" /> Бюджет каждого</h2>
          <button
            onClick={() => setShowBudgetModal(true)}
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
          >
            <Pencil className="size-3" /> Настроить
          </button>
        </div>
        <div className="space-y-2">
          {trip.participants.map((p) => (
            <ParticipantBudgetRow key={p.id} participant={p} spent={realExpenses.filter((e) => e.paidById === p.id).reduce((s, e) => s + e.amount, 0)} />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2.5">
          Общий бюджет группы: ${trip.settings.totalBudget} — сумма бюджетов участников.
        </p>
      </div>

      {/* Модалка настройки бюджетов */}
      <BudgetEditModal open={showBudgetModal} onOpenChange={setShowBudgetModal} />

      {/* Расчёт между друзьями */}
      <SettlementSection
        balances={balances}
        settlements={settlements}
        totalSpent={totalSpent}
        participantsCount={trip.participants.length}
      />

      {/* Список трат */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm">История трат</h2>
            {/* P2 #18: раздельные счётчики реальных трат и переводов */}
            <span className="text-xs text-muted-foreground">
              {realExpenses.length} {realExpenses.length === 1 ? "трата" : realExpenses.length < 5 ? "траты" : "трат"}
              {settlementCount > 0 && <span className="text-muted-foreground/70"> · {settlementCount} перевод{settlementCount === 1 ? "" : settlementCount < 5 ? "а" : "ов"}</span>}
            </span>
          </div>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className={cn(
              "text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors min-h-[36px]",
              showAdd
                ? "bg-secondary text-foreground border border-border"
                : "bg-primary text-primary-foreground"
            )}
          >
            {showAdd ? <X className="size-3" /> : <Plus className="size-3" />}
            {showAdd ? "Скрыть" : "Добавить"}
          </button>
        </div>

        <AnimatePresence>
          {showAdd && <AddExpenseForm onDone={() => setShowAdd(false)} />}
        </AnimatePresence>

        {/* P2 #17: Empty state «нет трат» + CTA */}
        {expenses.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <div className="text-4xl">📝</div>
            <p className="text-sm font-medium">Пока нет трат</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Добавь первую трату — обед, билет, сувенир. Бюджет и расчёты между друзьями обновятся автоматически.
            </p>
            {!showAdd && (
              <button
                onClick={() => setShowAdd(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground"
              >
                <Plus className="size-3.5" /> Добавить первую трату
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {expenses.map((e) => (
              <ExpenseRow key={e.id} expense={e} participants={trip.participants} />
            ))}
          </div>
        )}
      </div>

      {/* Конвертер валют */}
      <CurrencyConverter />
    </div>
  );
}
