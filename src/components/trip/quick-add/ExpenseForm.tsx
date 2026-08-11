"use client";

import { useState } from "react";
import { useTrip, useAddExpense } from "@/hooks/use-trip";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { Check, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DayPicker } from "./DayPicker";

interface ExpenseFormProps {
  userId: string;
  onDone: () => void;
}

export function ExpenseForm({ userId, onDone }: ExpenseFormProps) {
  const { data: trip } = useTrip();
  const addExpense = useAddExpense();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [dayId, setDayId] = useState(trip?.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ?? "");
  // splitUsers — кто участвует. По умолчанию НИКТО не выбран
  const [splitUsers, setSplitUsers] = useState<Set<string>>(new Set());

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || !description) {
      toast.error("Укажите сумму и описание");
      return;
    }
    if (splitUsers.size === 0) {
      toast.error("Выберите хотя бы одного участника");
      return;
    }

    const splitWithArr = Array.from(splitUsers).filter(id => id !== userId);
    const excludeSelf = !splitUsers.has(userId);

    await addExpense.mutateAsync({
      amount: amt,
      category,
      description,
      paidById: userId,
      dayId,
      splitWith: splitWithArr,
      excludeSelf,
    });

    if (splitWithArr.length > 0) {
      const splitCount = excludeSelf ? splitWithArr.length : splitWithArr.length + 1;
      const perPerson = (amt / splitCount).toFixed(2);
      const names = trip?.participants
        .filter(p => splitWithArr.includes(p.id))
        .map(p => p.name)
        .join(", ");
      toast.success("Трата добавлена 💸", {
        description: excludeSelf
          ? `${names} должны по $${perPerson} → тебе`
          : `Каждый должен $${perPerson} (включая тебя)`,
        duration: 5000,
      });
    } else {
      toast.success("Трата добавлена 💸");
    }
    setAmount("");
    setDescription("");
    setSplitUsers(new Set());
    onDone();
  };

  const toggleUser = (id: string) => {
    setSplitUsers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSplitUsers(new Set(trip?.participants.map(p => p.id) || []));
  };

  const splitCount = splitUsers.size > 0 ? splitUsers.size : 1;
  const perPerson = amount ? (parseFloat(amount) / splitCount).toFixed(2) : "0";

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <DayPicker value={dayId} onChange={setDayId} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Сумма ($)</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
        </div>
      </div>

      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Описание (например, Ужин в SoHo)"
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      />

      {/* Участники траты */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="size-3" /> За кого?
          </label>
          <button
            onClick={selectAll}
            className="text-[10px] text-primary font-medium active:scale-95 transition-transform"
          >
            Выбрать всех
          </button>
        </div>
        <div className="bg-background rounded-lg border border-input p-2 space-y-1">
          {trip?.participants.map((p) => {
            const checked = splitUsers.has(p.id);
            const isPayer = p.id === userId;
            return (
              <button
                key={p.id}
                onClick={() => toggleUser(p.id)}
                className={cn(
                  "w-full flex items-center gap-2 p-1.5 rounded-lg text-sm transition-colors active:scale-98",
                  "hover:bg-accent active:bg-accent",
                  checked && "bg-primary/10"
                )}
              >
                <div className={cn(
                  "size-5 rounded-md border-2 grid place-items-center shrink-0 transition-colors",
                  checked ? "bg-primary border-primary" : "border-input"
                )}>
                  {checked && <Check className="size-3 text-primary-foreground" />}
                </div>
                <div className="size-6 rounded-full grid place-items-center text-[10px]" style={{ background: p.color }}>
                  {p.emoji}
                </div>
                <span className="flex-1 text-left">{p.name}</span>
                {isPayer && <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ты</span>}
              </button>
            );
          })}
          {splitUsers.size > 0 && (
            <div className="text-[11px] text-primary bg-primary/5 rounded-lg px-2 py-1.5 mt-1 border border-primary/20">
              {splitUsers.has(userId)
                ? splitUsers.size === 1
                  ? <>💡 Личная трата (без долгов)</>
                  : <>💡 Доля каждого: <b>${perPerson}</b> ({splitCount} чел.)</>
                : <>💡 Каждый должен по <b>${perPerson}</b> тебе ({splitCount} чел.)</>
              }
            </div>
          )}
          {splitUsers.size === 0 && (
            <div className="text-[11px] text-amber-500 bg-amber-500/5 rounded-lg px-2 py-1.5 mt-1 border border-amber-500/20">
              Выбери хотя бы одного участника
            </div>
          )}
        </div>
      </div>

      <button
        onClick={submit}
        disabled={addExpense.isPending || splitUsers.size === 0}
        className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {addExpense.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Добавить трату
      </button>
    </div>
  );
}
