"use client";

import { useExpenses, useAddExpense, useDeleteExpense, useTrip } from "@/hooks/use-trip";
import { EXPENSE_CATEGORIES, type Expense, type Participant } from "@/lib/types";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Wallet, Plus, Trash2, TrendingDown, ArrowRight, Loader2, Scale } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function Budget() {
  const { data: expenses, isLoading } = useExpenses();
  const { data: trip } = useTrip();
  const [showAdd, setShowAdd] = useState(false);

  if (isLoading || !expenses || !trip) {
    return <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Загрузка бюджета…</div>;
  }

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const remaining = trip.settings.totalBudget - totalSpent;
  const budgetPct = (totalSpent / trip.settings.totalBudget) * 100;

  // По категориям
  const byCategory = Object.keys(EXPENSE_CATEGORIES).map((key) => {
    const sum = expenses.filter((e) => e.category === key).reduce((s, e) => s + e.amount, 0);
    return { key, label: EXPENSE_CATEGORIES[key].label, emoji: EXPENSE_CATEGORIES[key].emoji, color: EXPENSE_CATEGORIES[key].color, value: sum };
  }).filter((x) => x.value > 0);

  // Расчёт долгов: каждый должен = totalSpent / N. Кто заплатил больше — ему должны.
  const perPerson = totalSpent / trip.participants.length;
  const balances = trip.participants.map((p) => {
    const paid = expenses.filter((e) => e.paidById === p.id).reduce((s, e) => s + e.amount, 0);
    return { participant: p, paid, balance: paid - perPerson }; // + значит ему должны, - он должен
  });

  // Упрощённые расчёты: кто кому сколько
  const settlements = settleDebts(balances);

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Hero budget */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl">
        <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
          <Wallet className="size-4" /> Бюджет поездки
        </div>
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold">${totalSpent.toFixed(0)}</span>
          <span className="text-white/80 mb-1">/ ${trip.settings.totalBudget}</span>
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
                    formatter={(v: number) => `$${v.toFixed(0)}`}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
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

      {/* Расчёт между друзьями */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><Scale className="size-4" /> Расчёт между друзьями</h2>
        <div className="space-y-2 mb-3">
          {balances.map((b) => (
            <div key={b.participant.id} className="flex items-center gap-2 text-sm">
              <div className="size-7 rounded-full grid place-items-center text-xs" style={{ background: b.participant.color }}>
                {b.participant.emoji}
              </div>
              <span className="flex-1">{b.participant.name}</span>
              <span className="text-xs text-muted-foreground">внёс ${b.paid.toFixed(0)}</span>
              <span className={cn("font-semibold w-20 text-right", b.balance > 0 ? "text-green-600" : b.balance < 0 ? "text-red-500" : "text-muted-foreground")}>
                {b.balance > 0 ? `+$${b.balance.toFixed(0)}` : b.balance < 0 ? `−$${Math.abs(b.balance).toFixed(0)}` : "ровно"}
              </span>
            </div>
          ))}
        </div>
        {settlements.length > 0 ? (
          <div className="space-y-1.5 pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground mb-1">Кто кому переводит:</div>
            {settlements.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg px-2 py-1.5">
                <div className="size-6 rounded-full grid place-items-center text-[10px]" style={{ background: s.from.color }}>
                  {s.from.emoji}
                </div>
                <span className="font-medium">{s.from.name}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <div className="size-6 rounded-full grid place-items-center text-[10px]" style={{ background: s.to.color }}>
                  {s.to.emoji}
                </div>
                <span className="font-medium">{s.to.name}</span>
                <span className="ml-auto font-bold text-primary">${s.amount.toFixed(0)}</span>
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
            className="text-xs bg-primary text-primary-foreground px-2.5 py-1 rounded-lg flex items-center gap-1"
          >
            <Plus className="size-3" /> Добавить
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
    </div>
  );
}

function ExpenseRow({ expense, participants }: { expense: Expense; participants: Participant[] }) {
  const del = useDeleteExpense();
  const cat = EXPENSE_CATEGORIES[expense.category];
  const paidBy = participants.find((p) => p.id === expense.paidById);
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent group">
      <div className="size-8 rounded-lg grid place-items-center text-base shrink-0" style={{ background: `${cat?.color}22` }}>
        {cat?.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{expense.description}</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span>{cat?.label}</span>
          {expense.day && <span>· День {expense.day.dayNumber}</span>}
          {paidBy && (
            <span className="flex items-center gap-0.5">
              · <span className="size-3 rounded-full grid place-items-center text-[8px]" style={{ background: paidBy.color }}>{paidBy.emoji}</span>
              {paidBy.name}
            </span>
          )}
        </div>
      </div>
      <span className="font-semibold text-sm">${expense.amount.toFixed(0)}</span>
      <button
        onClick={() => { del.mutate(expense.id); toast.success("Удалено"); }}
        className="size-7 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 grid place-items-center transition-opacity"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function AddExpenseForm({ onDone }: { onDone: () => void }) {
  const { data: trip } = useTrip();
  const add = useAddExpense();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [paidById, setPaidById] = useState(trip?.settings.currentUserId ?? "");
  const [dayId, setDayId] = useState("");

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || !description) {
      toast.error("Заполните сумму и описание");
      return;
    }
    await add.mutateAsync({
      amount: amt,
      category,
      description,
      paidById,
      dayId: dayId || undefined,
    });
    toast.success("Трата добавлена 💸");
    setAmount(""); setDescription("");
    onDone();
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
    >
      <div className="bg-muted/40 rounded-xl p-3 space-y-2 mb-2">
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
          placeholder="Описание"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <select value={paidById} onChange={(e) => setPaidById(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
            {trip?.participants.map((p) => (
              <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
            ))}
          </select>
          <select value={dayId} onChange={(e) => setDayId(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="">Без дня</option>
            {trip?.days.map((d) => (
              <option key={d.id} value={d.id}>День {d.dayNumber} · {d.city}</option>
            ))}
          </select>
        </div>
        <button
          onClick={submit}
          disabled={add.isPending}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium flex items-center justify-center gap-2"
        >
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Добавить
        </button>
      </div>
    </motion.div>
  );
}

// Алгоритм упрощения долгов (greedy)
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
