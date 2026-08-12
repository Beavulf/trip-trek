"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Plus, TrendingDown, BarChart3, UserCircle, Pencil, Loader2, Wallet } from "lucide-react";
import { useExpenses, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { currencySymbol } from "@/lib/currencies";
import { calculateBalances, calculateSettlements } from "@/lib/budget";
import { CurrencyConverter } from "../currency-converter";
import { BudgetPlanWidget } from "../budget-plan-widget";
import { BudgetHero } from "./BudgetHero";
import { ExpenseRow } from "./ExpenseRow";
import { AddExpenseForm } from "./AddExpenseForm";
import { ParticipantBudgetRow } from "./ParticipantBudgetRow";
import { BudgetEditModal } from "./BudgetEditModal";
import { SettlementSection } from "./SettlementSection";
import { MobileBottomSheet } from "../mobile-bottom-sheet";

export function Budget() {
  const tripId = useCurrentTripId();
  const { data: expenses, isLoading: expensesLoading, error: expensesError, refetch: refetchExpenses } = useExpenses();
  const { data: trip, isLoading: tripLoading, error: tripError, refetch: refetchTrip } = useTrip();
  const { setTripSwitcherOpen } = useTripStore();
  const [showAdd, setShowAdd] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">💰</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Выбери поездку, чтобы вести бюджет</p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (tripError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <p className="text-xs">Возможно поездка удалена или нет доступа</p>
        <button
          type="button"
          onClick={() => refetchTrip()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
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
          type="button"
          onClick={() => refetchExpenses()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (tripLoading || expensesLoading || !expenses || !trip) {
    return (
      <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Загрузка бюджета…
      </div>
    );
  }

  const realExpenses = expenses.filter((e) => e.category !== "settlement");
  const settlementCount = expenses.length - realExpenses.length;
  const totalSpent = realExpenses.reduce((s, e) => s + e.amount, 0);
  const remaining = trip.settings.totalBudget - totalSpent;
  const budgetPct = trip.settings.totalBudget > 0 ? (totalSpent / trip.settings.totalBudget) * 100 : 0;

  const byCategory = Object.keys(EXPENSE_CATEGORIES)
    .map((key) => {
      const sum = realExpenses.filter((e) => e.category === key).reduce((s, e) => s + e.amount, 0);
      return {
        key,
        label: EXPENSE_CATEGORIES[key].label,
        emoji: EXPENSE_CATEGORIES[key].emoji,
        color: EXPENSE_CATEGORIES[key].color,
        value: sum,
      };
    })
    .filter((x) => x.value > 0);

  const balances = calculateBalances(expenses, trip.participants);
  const settlements = calculateSettlements(expenses, trip.participants);

  return (
    <div className="space-y-4 animate-fade-up">
      <BudgetHero
        totalSpent={totalSpent}
        totalBudget={trip.settings.totalBudget}
        budgetPct={budgetPct}
        remaining={remaining}
      />

      {byCategory.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4">
          <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <TrendingDown className="size-4" /> По категориям
          </h2>
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
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--foreground)",
                    }}
                    labelStyle={{ color: "var(--foreground)" }}
                    itemStyle={{ color: "var(--foreground)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5 min-w-0">
              {byCategory
                .sort((a, b) => b.value - a.value)
                .map((c) => (
                  <div key={c.key} className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="text-base">{c.emoji}</span>
                    <span className="flex-1 truncate text-muted-foreground">{c.label}</span>
                    <span className="font-semibold">${c.value.toFixed(0)}</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {((c.value / totalSpent) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {(() => {
        const dailyData = trip.days
          .map((d) => {
            const dayExpenses = realExpenses.filter((e) => e.dayId === d.id);
            const sum = dayExpenses.reduce((s, e) => s + e.amount, 0);
            return { day: `Д${d.dayNumber}`, amount: Math.round(sum), city: d.city };
          })
          .filter((d) => d.amount > 0);

        if (dailyData.length === 0) return null;

        const sym = currencySymbol(trip.settings.currency);
        const dayColor = (cityName: string) =>
          trip.days.find((d) => d.city === cityName)?.accentColor ?? "#0ea5e9";

        return (
          <div className="rounded-2xl bg-card border border-border p-4">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <BarChart3 className="size-4" /> Траты по дням
            </h2>
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
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--foreground)",
                    }}
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
              Всего {dailyData.length} дней с тратами · средний день: {sym}
              {Math.round(dailyData.reduce((s, d) => s + d.amount, 0) / dailyData.length)}
            </p>
          </div>
        );
      })()}

      <BudgetPlanWidget />

      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <UserCircle className="size-4" /> Бюджет каждого
          </h2>
          <button
            onClick={() => setShowBudgetModal(true)}
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1 min-h-[44px]"
          >
            <Pencil className="size-3" /> Настроить
          </button>
        </div>
        <div className="space-y-2">
          {trip.participants.map((p) => (
            <ParticipantBudgetRow
              key={p.id}
              participant={p}
              spent={realExpenses.filter((e) => e.paidById === p.id).reduce((s, e) => s + e.amount, 0)}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2.5">
          Общий бюджет группы: ${trip.settings.totalBudget} — сумма бюджетов участников.
        </p>
      </div>

      <BudgetEditModal open={showBudgetModal} onOpenChange={setShowBudgetModal} />

      <SettlementSection
        balances={balances}
        settlements={settlements}
        totalSpent={totalSpent}
        participantsCount={trip.participants.length}
      />

      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm">История трат</h2>
            <span className="text-xs text-muted-foreground">
              {realExpenses.length}{" "}
              {realExpenses.length === 1 ? "трата" : realExpenses.length < 5 ? "траты" : "трат"}
              {settlementCount > 0 && (
                <span className="text-muted-foreground/70">
                  {" "}
                  · {settlementCount} перевод
                  {settlementCount === 1 ? "" : settlementCount < 5 ? "а" : "ов"}
                </span>
              )}
            </span>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs px-3 py-2 rounded-lg flex items-center gap-1 transition-colors min-h-[44px] bg-primary text-primary-foreground"
          >
            <Plus className="size-3.5" />
            Добавить
          </button>
        </div>

        {expenses.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <div className="text-4xl">📝</div>
            <p className="text-sm font-medium">Пока нет трат</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Добавь первую трату — обед, билет, сувенир. Бюджет и расчёты между друзьями обновятся
              автоматически.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-[44px]"
            >
              <Plus className="size-3.5" /> Добавить первую трату
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {expenses.map((e) => (
              <ExpenseRow key={e.id} expense={e} participants={trip.participants} />
            ))}
          </div>
        )}
      </div>

      <MobileBottomSheet
        open={showAdd}
        onOpenChange={setShowAdd}
        title="Новая трата"
        titleIcon={<Wallet className="size-5 text-primary" />}
      >
        <AddExpenseForm onDone={() => setShowAdd(false)} />
      </MobileBottomSheet>

      <CurrencyConverter />
    </div>
  );
}
