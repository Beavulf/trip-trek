"use client";

import { useExpenses, useAddExpense, useDeleteExpense, useTrip, useUpdateMember, useUpdateTripBudget, getTripId } from "@/hooks/use-trip";
import { EXPENSE_CATEGORIES, CITIES, type Expense, type Participant } from "@/lib/types";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Wallet, Plus, Trash2, TrendingDown, ArrowRight, Loader2, Scale, UserCircle, Pencil, BarChart3, Check, X, Users, Clock, Info, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { CurrencyConverter } from "./currency-converter";
import { BudgetPlanWidget } from "./budget-plan-widget";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

export function Budget() {
  const { data: expenses, isLoading } = useExpenses();
  const { data: trip } = useTrip();
  const [showAdd, setShowAdd] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showBalanceHint, setShowBalanceHint] = useState(false);
  const [showSettlementHint, setShowSettlementHint] = useState(false);
  const [expandedBalance, setExpandedBalance] = useState<string | null>(null);

  if (isLoading || !expenses || !trip) {
    return <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Загрузка бюджета…</div>;
  }

  // Исключаем переводы (settlement) из общей статистики
  const realExpenses = expenses.filter((e) => e.category !== "settlement");
  const totalSpent = realExpenses.reduce((s, e) => s + e.amount, 0);
  const remaining = trip.settings.totalBudget - totalSpent;
  const budgetPct = (totalSpent / trip.settings.totalBudget) * 100;

  // По категориям (без переводов)
  const byCategory = Object.keys(EXPENSE_CATEGORIES).map((key) => {
    const sum = realExpenses.filter((e) => e.category === key).reduce((s, e) => s + e.amount, 0);
    return { key, label: EXPENSE_CATEGORIES[key].label, emoji: EXPENSE_CATEGORIES[key].emoji, color: EXPENSE_CATEGORIES[key].color, value: sum };
  }).filter((x) => x.value > 0);

  // === НОВАЯ ЛОГИКА ДОЛГОВ ===
  // Личные траты (splitWith пустой) — НЕ создают долгов, просто учитываются в статистике
  // Траты с splitWith — создают долги: каждый в splitWith должен плательщику свою долю
  // excludeSelf = true → плательщик не участвует (купил только для других)
  // excludeSelf = false → плательщик тоже участвует (купил для себя + других)

  // Считаем paid (сколько каждый реально заплатил, без settlement)
  // и долги (кто кому сколько должен)
  const balances = trip.participants.map((p) => {
    // Сколько реально заплатил (все траты кроме settlement)
    const paid = expenses
      .filter((e) => e.paidById === p.id && e.category !== "settlement")
      .reduce((s, e) => s + e.amount, 0);

    // Сколько мне должны (я плательщик в split-тратах)
    let owedToMe = 0;
    expenses
      .filter((e) => e.paidById === p.id && e.splitWith && e.splitWith?.length > 0)
      .forEach((e) => {
        const splitUsers: string[] = (e.splitWith || "").split(",").filter(Boolean);
        if (splitUsers.length === 0) return;
        const perPerson = e.excludeSelf
          ? e.amount / splitUsers.length
          : e.amount / (splitUsers.length + 1);
        owedToMe += perPerson * splitUsers.length;
      });

    // Сколько я должен другим (я в splitWith чужих трат)
    let owedToOthers = 0;
    expenses
      .filter((e) => e.paidById !== p.id && e.splitWith && e.splitWith?.length > 0)
      .forEach((e) => {
        const splitUsers: string[] = (e.splitWith || "").split(",").filter(Boolean);
        if (!splitUsers.includes(p.id)) return;
        const perPerson = e.excludeSelf
          ? e.amount / splitUsers.length
          : e.amount / (splitUsers.length + 1);
        owedToOthers += perPerson;
      });

    // Баланс: + значит мне должны, - значит я должен
    const balance = owedToMe - owedToOthers;
    return { participant: p, paid, balance, owedToMe, owedToOthers };
  });

  // Расчёт кто кому конкретно должен (per-person debts)
  const debtsMap: Record<string, Record<string, number>> = {};
  expenses
    .filter((e) => e.splitWith && e.splitWith?.length > 0)
    .forEach((e) => {
      const splitUsers: string[] = (e.splitWith || "").split(",").filter(Boolean);
      if (splitUsers.length === 0) return;
      const perPerson = e.excludeSelf
        ? e.amount / splitUsers.length
        : e.amount / (splitUsers.length + 1);
      splitUsers.forEach((userId) => {
        if (!debtsMap[userId]) debtsMap[userId] = {};
        debtsMap[userId][e.paidById] = (debtsMap[userId][e.paidById] || 0) + perPerson;
      });
    });

  // Упрощаем: если A должен B $X и B должен A $Y → net = X - Y
  const settlements: { from: Participant; to: Participant; amount: number }[] = [];
  const participants = trip.participants;
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i].id;
      const b = participants[j].id;
      const aToB = debtsMap[a]?.[b] || 0; // A должен B
      const bToA = debtsMap[b]?.[a] || 0; // B должен A
      const net = aToB - bToA;
      if (net > 0.01) {
        settlements.push({ from: participants[i], to: participants[j], amount: Math.round(net * 100) / 100 });
      } else if (net < -0.01) {
        settlements.push({ from: participants[j], to: participants[i], amount: Math.round(-net * 100) / 100 });
      }
    }
  }
  // Сортируем по убыванию суммы
  settlements.sort((a, b) => b.amount - a.amount);

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
            <ParticipantBudgetRow key={p.id} participant={p} spent={expenses.filter((e) => e.paidById === p.id).reduce((s, e) => s + e.amount, 0)} />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2.5">
          Общий бюджет группы: ${trip.settings.totalBudget} — сумма бюджетов участников.
        </p>
      </div>

      {/* Модалка настройки бюджетов */}
      <BudgetEditModal open={showBudgetModal} onOpenChange={setShowBudgetModal} />

      {/* Расчёт между друзьями */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <Scale className="size-4" />
          <h2 className="font-semibold text-sm">Расчёт между друзьями</h2>
          <button
            onClick={() => setShowBalanceHint(v => !v)}
            className="ml-auto size-6 rounded-full bg-muted grid place-items-center text-muted-foreground shrink-0 active:scale-90 transition-transform"
            title="Как это работает?"
          >
            <Info className="size-3.5" />
          </button>
        </div>

        {/* Разворачивающаяся подсказка (тап по ℹ️) */}
        <AnimatePresence>
          {showBalanceHint && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-muted/50 rounded-xl p-3 mb-3 space-y-1.5 text-[11px] text-muted-foreground">
                <div className="flex items-start gap-1.5">
                  <span className="text-primary shrink-0">①</span>
                  <span><b className="text-foreground">Личная трата</b> (только за себя) — просто учитывается в статистике, долги не создаёт.</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-primary shrink-0">②</span>
                  <span><b className="text-foreground">Заплатил за других</b> — те, за кого заплатил, должны тебе деньги.</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-primary shrink-0">③</span>
                  <span><b className="text-foreground">Внёс</b> — сколько всего человек заплатил из кошелька.</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-primary shrink-0">④</span>
                  <span><b className="text-green-600">+</b> зелёная — человеку должны. <b className="text-red-500">−</b> красная — человек должен.</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-primary shrink-0">⑤</span>
                  <span>Кнопка <b className="text-foreground">«Перевели»</b> — у того, кому должны. Нажми когда получил перевод.</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Балансы участников */}
        <div className="space-y-2 mb-3">
          {balances.map((b) => {
            return (
              <div key={b.participant.id} className="flex items-center gap-2.5 text-sm">
                <div className="size-8 rounded-full grid place-items-center text-xs shrink-0" style={{ background: b.participant.color }}>
                  {b.participant.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{b.participant.name}</div>
                  <button
                    onClick={() => setExpandedBalance(expandedBalance === b.participant.id ? null : b.participant.id)}
                    className="text-[10px] text-muted-foreground flex items-center gap-1 active:scale-95 transition-transform"
                  >
                    внёс ${b.paid.toFixed(0)}
                    <ChevronDown className={cn("size-2.5 transition-transform", expandedBalance === b.participant.id && "rotate-180")} />
                  </button>
                </div>
                <span className={cn("font-semibold text-right text-sm shrink-0", b.balance > 0 ? "text-green-600" : b.balance < 0 ? "text-red-500" : "text-muted-foreground")}>
                  {b.balance > 0 ? `+$${b.balance.toFixed(0)}` : b.balance < 0 ? `−$${Math.abs(b.balance).toFixed(0)}` : "ровно"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Расшифровка для выбранного участника */}
        <AnimatePresence>
          {expandedBalance && (() => {
            const b = balances.find(x => x.participant.id === expandedBalance);
            if (!b) return null;
            const share = totalSpent / trip.participants.length;
            return (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-muted/40 rounded-xl p-3 mb-3 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{b.participant.name} заплатил всего</span>
                    <span className="font-medium">${b.paid.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Ему должны</span>
                    <span className="font-medium text-green-600">${b.owedToMe.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Он должен</span>
                    <span className="font-medium text-red-500">${b.owedToOthers.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-border pt-1.5 flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {b.balance > 0 ? "Итог: ему должны" : b.balance < 0 ? "Итог: он должен" : "Итог: всё поровну"}
                    </span>
                    <span className={cn("font-bold", b.balance > 0 ? "text-green-600" : b.balance < 0 ? "text-red-500" : "text-muted-foreground")}>
                      {b.balance > 0 ? `+$${b.balance.toFixed(2)}` : b.balance < 0 ? `−$${Math.abs(b.balance).toFixed(2)}` : "$0"}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Кто кому переводит */}
        {settlements.length > 0 ? (
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground font-medium">Кому сколько перевести:</span>
              <button
                onClick={() => setShowSettlementHint(v => !v)}
                className="size-5 rounded-full bg-muted grid place-items-center text-muted-foreground shrink-0 active:scale-90 transition-transform"
              >
                <Info className="size-3" />
              </button>
            </div>
            <AnimatePresence>
              {showSettlementHint && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-muted/50 rounded-lg p-2.5 mb-2 text-[11px] text-muted-foreground">
                    💡 Чтобы все были в расчёте, достаточно сделать эти переводы. Сумма подобрана так, чтобы после переводов у каждого был ноль.
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {settlements.map((s, i) => (
              <div key={i} className="bg-muted/40 rounded-xl px-3 py-2.5">
                {/* Главная строка: от → кому + сумма */}
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded-full grid place-items-center text-[10px] shrink-0" style={{ background: s.from.color }}>
                    {s.from.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{s.from.name}</div>
                    <div className="text-[10px] text-red-500">должен</div>
                  </div>
                  <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
                  <div className="size-7 rounded-full grid place-items-center text-[10px] shrink-0" style={{ background: s.to.color }}>
                    {s.to.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{s.to.name}</div>
                    <div className="text-[10px] text-green-600">получит</div>
                  </div>
                  <span className="font-bold text-primary text-sm shrink-0">${s.amount.toFixed(0)}</span>
                </div>
                {/* Кнопка отметки */}
                <div className="mt-2 flex justify-end">
                  <MarkSettledButton from={s.from} to={s.to} amount={s.amount} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-green-600 text-center py-2">Все расчёты ровны 🎉</div>
        )}
      </div>

      {/* Список трат */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">История трат ({expenses.length})</h2>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors",
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

        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {expenses.map((e) => (
            <ExpenseRow key={e.id} expense={e} participants={trip.participants} />
          ))}
        </div>
      </div>

      {/* Конвертер валют */}
      <CurrencyConverter />
    </div>
  );
}

function ExpenseRow({ expense, participants }: { expense: Expense; participants: Participant[] }) {
  const del = useDeleteExpense();
  const [confirming, setConfirming] = useState(false);
  const isSettlement = expense.category === "settlement";
  const cat = EXPENSE_CATEGORIES[expense.category];
  const paidBy = participants.find((p) => p.id === expense.paidById);
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent group">
      <div className={cn("size-8 rounded-lg grid place-items-center text-base shrink-0", isSettlement ? "bg-green-600/15" : "")} style={{ background: isSettlement ? undefined : `${cat?.color}22` }}>
        {isSettlement ? "💸" : cat?.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{expense.description}</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span>{isSettlement ? "Перевод" : cat?.label}</span>
          {expense.day && <span>· День {expense.day.dayNumber}</span>}
          {paidBy && (
            <span className="flex items-center gap-0.5">
              · <span className="size-3 rounded-full grid place-items-center text-[8px]" style={{ background: paidBy.color }}>{paidBy.emoji}</span>
              {paidBy.name}
            </span>
          )}
        </div>
      </div>
      <span className="font-semibold text-sm shrink-0">${expense.amount.toFixed(0)}</span>
      {confirming ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { del.mutate(expense.id); toast.success("Удалено"); setConfirming(false); }}
            disabled={del.isPending}
            className="text-[10px] bg-red-500 text-white px-2 py-1 rounded-lg font-medium"
          >
            {del.isPending ? "…" : "Да"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-[10px] bg-secondary px-2 py-1 rounded-lg"
          >
            Нет
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="size-7 rounded-lg hover:bg-red-500/10 hover:text-red-500 grid place-items-center transition-colors text-muted-foreground"
          title="Удалить"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function AddExpenseForm({ onDone }: { onDone: () => void }) {
  const { data: trip } = useTrip();
  const add = useAddExpense();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  // По умолчанию — текущий пользователь (тот кто добавляет = тот кто платит)
  const [paidById, setPaidById] = useState(currentUserId || trip?.participants[0]?.id || "");
  const [dayId, setDayId] = useState("");
  const [splitWith, setSplitWith] = useState<Set<string>>(new Set());
  // excludeSelf — заплатил ТОЛЬКО за других (на себя не тратил)
  const [excludeSelf, setExcludeSelf] = useState(false);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || !description) {
      toast.error("Заполните сумму и описание");
      return;
    }
    if (!paidById) {
      toast.error("Выберите кто заплатил");
      return;
    }
    await add.mutateAsync({
      amount: amt,
      category,
      description,
      paidById,
      dayId: dayId || undefined,
      splitWith: Array.from(splitWith),
      excludeSelf,
    });
    // Подсказка о долге если splitWith выбран
    if (splitWith.size > 0) {
      const splitCount = excludeSelf ? splitWith.size : splitWith.size + 1;
      const perPerson = (amt / splitCount).toFixed(2);
      const payer = trip?.participants.find(p => p.id === paidById);
      const names = trip?.participants
        .filter(p => splitWith.has(p.id))
        .map(p => p.name)
        .join(", ");
      toast.success("Трата добавлена 💸", {
        description: excludeSelf
          ? `Долг: ${names} должны по $${perPerson} → ${payer?.name || "тебе"}`
          : `Долг: каждый должен $${perPerson} (включая ${payer?.name || "плательщика"})`,
        duration: 5000,
      });
    } else {
      toast.success("Трата добавлена 💸");
    }
    setAmount(""); setDescription(""); setSplitWith(new Set()); setExcludeSelf(false);
    onDone();
  };

  const toggleSplit = (id: string) => {
    setSplitWith(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Расчёт доли
  const splitCount = splitWith.size > 0
    ? (excludeSelf ? splitWith.size : splitWith.size + 1)
    : 1;
  const perPerson = amount ? (parseFloat(amount) / splitCount).toFixed(2) : "0";

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="bg-muted/40 rounded-xl p-3 space-y-2.5 mb-2">
        {/* Подсказка */}
        <div className="text-[10px] text-muted-foreground bg-background/80 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
          <Users className="size-3 shrink-0" />
          <span>Кто платит — тот кто достал карту. Отметь за кого, чтобы посчитать долги.</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Сумма $"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
            {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание (например, Ужин в SoHo)"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />

        {/* Кто заплатил */}
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block flex items-center gap-1">
            <Wallet className="size-3" /> Кто заплатил?
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {trip?.participants.map((p) => (
              <button
                key={p.id}
                onClick={() => setPaidById(p.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                  paidById === p.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-background border border-input hover:bg-accent"
                )}
              >
                <div className="size-5 rounded-full grid place-items-center text-[10px]" style={{ background: p.color }}>
                  {p.emoji}
                </div>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* За кого заплатил (split) */}
        <div>
          <label className="text-[10px] text-muted-foreground mb-1 block flex items-center gap-1">
            <Users className="size-3" /> За кого заплатил? (необязательно)
          </label>
          <div className="bg-background rounded-lg border border-input p-2 space-y-1">
            {/* Чекбокс "только за других" */}
            <button
              onClick={() => setExcludeSelf(v => !v)}
              className={cn(
                "w-full flex items-center gap-2 p-1.5 rounded-lg text-xs transition-colors",
                excludeSelf ? "bg-amber-500/10 text-amber-600" : "hover:bg-accent"
              )}
            >
              <div className={cn(
                "size-4 rounded border-2 grid place-items-center shrink-0",
                excludeSelf ? "bg-amber-500 border-amber-500" : "border-input"
              )}>
                {excludeSelf && <Check className="size-3 text-white" />}
              </div>
              <span className="flex-1 text-left font-medium">Заплатил только за них (на себя не тратил)</span>
            </button>

            {trip?.participants.map((p) => {
              const isPayer = p.id === paidById;
              const checked = splitWith.has(p.id) || (isPayer && !excludeSelf);
              return (
                <button
                  key={p.id}
                  onClick={() => !isPayer && toggleSplit(p.id)}
                  disabled={isPayer}
                  className={cn(
                    "w-full flex items-center gap-2 p-1.5 rounded-lg text-sm transition-colors",
                    isPayer ? "opacity-50 cursor-not-allowed" : "hover:bg-accent",
                    checked && !isPayer && "bg-primary/10"
                  )}
                >
                  <div className={cn(
                    "size-4 rounded border-2 grid place-items-center shrink-0",
                    checked ? "bg-primary border-primary" : "border-input"
                  )}>
                    {checked && <Check className="size-3 text-primary-foreground" />}
                  </div>
                  <div className="size-6 rounded-full grid place-items-center text-[10px]" style={{ background: p.color }}>
                    {p.emoji}
                  </div>
                  <span className="flex-1 text-left">{p.name}</span>
                  {isPayer && <span className="text-[10px] text-muted-foreground">(заплатил)</span>}
                </button>
              );
            })}
            {splitWith.size > 0 && (
              <div className="text-[11px] text-primary bg-primary/5 rounded-lg px-2 py-1.5 mt-1 border border-primary/20">
                {excludeSelf
                  ? <>💡 Каждый должен по <b>${perPerson}</b> плательщику (ты не участвуешь)</>
                  : <>💡 Каждый должен по <b>${perPerson}</b> (включая плательщика)</>
                }
              </div>
            )}
          </div>
        </div>

        <select value={dayId} onChange={(e) => setDayId(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <option value="">Без дня</option>
          {trip?.days.map((d) => (
            <option key={d.id} value={d.id}>День {d.dayNumber} · {d.city}</option>
          ))}
        </select>

        <button
          onClick={submit}
          disabled={add.isPending}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium flex items-center justify-center gap-2"
        >
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Добавить трату
        </button>
      </div>
    </motion.div>
  );
}

function ParticipantBudgetRow({ participant, spent }: { participant: Participant; spent: number }) {
  const update = useUpdateMember();
  const tripId = getTripId();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(participant.budget?.toString() ?? "");

  const budget = participant.budget;
  const remaining = budget !== null ? budget - spent : null;
  const pct = budget && budget > 0 ? Math.min(100, (spent / budget) * 100) : null;

  const save = () => {
    const num = val.trim() ? parseFloat(val) : null;
    // participant.id — это userId, нужно найти memberId из trip.members
    // Но в текущей архитектуре participants уже имеют id = userId
    // Используем tripId + participant.id как memberId (упрощение)
    update.mutate({ memberId: participant.id, tripId, budget: num });
    toast.success("Бюджет обновлён");
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent/50">
      <div className="size-8 rounded-full grid place-items-center text-sm shrink-0" style={{ background: participant.color }}>
        {participant.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{participant.name}</div>
        <div className="text-[11px] text-muted-foreground">потратил ${spent.toFixed(0)}</div>
        {pct !== null && (
          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden max-w-[120px]">
            <div
              className={cn("h-full rounded-full", pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-green-500")}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            onBlur={save}
            autoFocus
            placeholder="—"
            className="w-20 text-sm rounded-lg border border-input bg-background px-2 py-1 text-right"
          />
        </div>
      ) : (
        <button
          onClick={() => { setVal(participant.budget?.toString() ?? ""); setEditing(true); }}
          className="text-right group"
        >
          <div className={cn("text-sm font-semibold", remaining !== null && remaining < 0 && "text-red-500")}>
            {budget !== null ? `$${budget}` : "—"}
          </div>
          {remaining !== null && (
            <div className={cn("text-[10px]", remaining < 0 ? "text-red-500" : "text-muted-foreground")}>
              ост. ${remaining.toFixed(0)}
            </div>
          )}
          <Pencil className="size-2.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors inline-block ml-1" />
        </button>
      )}
    </div>
  );
}

// Алгоритм упрощения долгов (greedy)
function BudgetHero({ totalSpent, totalBudget, budgetPct, remaining }: {
  totalSpent: number;
  totalBudget: number;
  budgetPct: number;
  remaining: number;
}) {
  const update = useUpdateTripBudget();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(totalBudget));

  const save = () => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      update.mutate(num);
      toast.success("Бюджет обновлён");
    }
    setEditing(false);
  };

  return (
    <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl relative overflow-hidden">
      <div className="absolute -bottom-6 -right-4 text-[100px] opacity-10 select-none">💰</div>
      <div className="relative">
        <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
          <Wallet className="size-4" /> Бюджет поездки
          {!editing && (
            <button
              onClick={() => { setVal(String(totalBudget)); setEditing(true); }}
              className="ml-auto size-7 rounded-lg bg-white/15 hover:bg-white/25 grid place-items-center transition-colors"
              title="Изменить бюджет"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <span className="text-4xl font-bold tabular-nums">${totalSpent.toFixed(0)}</span>
          <span className="text-white/80 mb-1">/</span>
          {editing ? (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-white/80">$</span>
              <input
                type="number"
                inputMode="decimal"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setEditing(false);
                }}
                onBlur={save}
                autoFocus
                className="w-24 text-2xl font-bold bg-white/15 rounded-lg px-2 py-0.5 outline-none placeholder:text-white/50"
                placeholder="1100"
              />
              <button onClick={save} className="size-7 rounded-lg bg-white/20 hover:bg-white/30 grid place-items-center">
                <Check className="size-4" />
              </button>
              <button onClick={() => setEditing(false)} className="size-7 rounded-lg bg-white/20 hover:bg-white/30 grid place-items-center">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <span className="text-white/80 mb-1 font-semibold">${totalBudget}</span>
          )}
        </div>

        <div className="mt-3 h-2.5 rounded-full bg-white/20 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, budgetPct)}%` }}
            transition={{ duration: 0.8 }}
            className={cn("h-full rounded-full", budgetPct > 90 ? "bg-red-300" : "bg-white")}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-sm">
          <span className="text-white/80">Потрачено {budgetPct.toFixed(0)}%</span>
          <span className={cn("font-semibold", remaining < 0 ? "text-red-200" : "text-white")}>
            {remaining >= 0 ? `Остаток $${remaining.toFixed(0)}` : `Перерасход $${Math.abs(remaining).toFixed(0)}`}
          </span>
        </div>
      </div>
    </div>
  );
}

// Кнопка "Отметить перевод" — записывает перевод как специальную трату
function MarkSettledButton({ from, to, amount }: { from: Participant; to: Participant; amount: number }) {
  const addExpense = useAddExpense();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const [done, setDone] = useState(false);

  // from = должник, to = кредитор (ему должны)
  const isCreditor = currentUserId === to.id; // Мне должны → я подтверждаю получение
  const isDebtor = currentUserId === from.id; // Я должен → жду подтверждения

  const handleSettle = async () => {
    // Создаём settlement-трату: должник (from) "заплатил" кредитору (to)
    // splitWith = to, excludeSelf = true → создаёт обратный долг (to должен from)
    // Этот обратный долг компенсирует исходный
    await addExpense.mutateAsync({
      amount: Math.round(amount * 100) / 100,
      category: "settlement",
      description: `Перевод: ${from.name} → ${to.name}`,
      paidById: from.id,
      splitWith: [to.id],
      excludeSelf: true,
    });
    toast.success("Перевод подтверждён ✅", { description: `$${amount.toFixed(2)} от ${from.name}` });
    setDone(true);
  };

  if (done) {
    return (
      <span className="shrink-0 text-[10px] text-green-600 font-medium flex items-center gap-1 px-2 py-1">
        <Check className="size-3" /> Получено
      </span>
    );
  }

  // Кредитор (ему должны) — может нажать "Перевели" чтобы подтвердить получение
  if (isCreditor) {
    return (
      <button
        onClick={handleSettle}
        disabled={addExpense.isPending}
        className="shrink-0 text-[10px] bg-green-600/10 text-green-600 hover:bg-green-600/20 px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-colors active:scale-95"
        title={`Подтвердить что ${from.name} перевёл $${amount.toFixed(2)}`}
      >
        {addExpense.isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        Перевели
      </button>
    );
  }

  // Должник — видит что ждут подтверждения
  if (isDebtor) {
    return (
      <span className="shrink-0 text-[10px] text-muted-foreground flex items-center gap-1 px-2 py-1">
        <Clock className="size-3" /> Ждём подтверждения
      </span>
    );
  }

  // Если я ни при чём — ничего не показываем
  return null;
}

function settleDebts(balances: { participant: Participant; paid: number; balance: number }[]) {
  const creditors = balances.filter((b) => b.balance > 0.01).sort((a, b) => b.balance - a.balance);
  const debtors = balances.filter((b) => b.balance < -0.01).sort((a, b) => a.balance - b.balance);
  const result: { from: Participant; to: Participant; amount: number }[] = [];
  let i = 0, j = 0;
  const c = creditors.map((x) => ({ ...x }));
  const d = debtors.map((x) => ({ ...x }));
  while (i < d.length && j < c.length) {
    const amt = Math.min(-d[i].balance, c[j].balance);
    result.push({ from: d[i].participant, to: c[j].participant, amount: amt });
    d[i].balance += amt;
    c[j].balance -= amt;
    if (Math.abs(d[i].balance) < 0.01) i++;
    if (Math.abs(c[j].balance) < 0.01) j++;
  }
  return result;
}

// Модалка настройки бюджетов участников
function BudgetEditModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  useBodyScrollLock(open);
  const { data: trip } = useTrip();
  const update = useUpdateMember();
  const tripId = getTripId();
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Инициализация при открытии
  useEffect(() => {
    if (open && trip?.participants) {
      const init: Record<string, string> = {};
      trip.participants.forEach((p) => { init[p.id] = p.budget?.toString() ?? ""; });
      setBudgets(init);
    }
  }, [open, trip]);

  if (!open || typeof document === "undefined" || !trip) return null;

  const total = Object.values(budgets).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const save = async () => {
    setSaving(true);
    try {
      for (const p of trip.participants) {
        const val = budgets[p.id] ?? "";
        const num = val.trim() ? parseFloat(val) : null;
        if (num !== p.budget) {
          await fetch(`/api/trips/${tripId}/members/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ budget: num }),
          });
        }
      }
      toast.success("Бюджеты обновлены! 💰");
      onOpenChange(false);
    } catch {
      toast.error("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-md max-h-[90vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto"
        >
          {/* Handle */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="sticky top-0 bg-card/95 backdrop-blur px-4 py-3 border-b border-border flex items-center justify-between z-10">
            <h2 className="font-bold text-base flex items-center gap-2">
              <Users className="size-4" /> Бюджеты участников
            </h2>
            <button onClick={() => onOpenChange(false)} className="size-8 rounded-full hover:bg-accent grid place-items-center">
              <X className="size-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Установи личный бюджет для каждого участника. Общий бюджет = сумма всех.
            </p>

            {/* Список участников */}
            {trip.participants.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50">
                <div className="size-10 rounded-full grid place-items-center text-lg shrink-0" style={{ background: p.color }}>
                  {p.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  {p.role && <div className="text-[10px] text-muted-foreground">{p.role}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={budgets[p.id] ?? ""}
                    onChange={(e) => setBudgets({ ...budgets, [p.id]: e.target.value })}
                    placeholder="—"
                    className="w-20 text-sm rounded-lg border border-input bg-background px-2 py-1.5 text-right"
                  />
                </div>
              </div>
            ))}

            {/* Итого */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
              <span className="text-sm font-semibold">Общий бюджет:</span>
              <span className="text-lg font-bold text-primary">${total.toFixed(0)}</span>
            </div>

            {/* Кнопка сохранить */}
            <button
              onClick={save}
              disabled={saving}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
