"use client";

import { useEffect, useState } from "react";
import { useTrip, useAddExpense, useCurrency } from "@/hooks/use-trip";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { CURRENCIES, currencySymbol } from "@/lib/currencies";
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
  const { data: currency } = useCurrency();
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(() => {
    if (typeof window === "undefined") return "USD";
    return localStorage.getItem("triptrek-currency") || trip?.settings?.currency || "USD";
  });
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [dayId, setDayId] = useState("");
  const [splitUsers, setSplitUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!trip?.days?.length) return;
    if (dayId && trip.days.some((d) => d.id === dayId)) return;
    const today =
      trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ??
      trip.days[0]?.id ??
      "";
    setDayId(today);
  }, [trip, dayId]);

  const usdRate = currency?.rates?.[currencyCode] || 1;
  const amountNum = parseFloat(amount) || 0;
  const amountUSD = currencyCode === "USD" ? amountNum : amountNum / usdRate;
  const sym = currencySymbol(currencyCode);

  const submit = async () => {
    const desc = description.trim();
    if (!amountNum || !desc) {
      toast.error("Укажите сумму и описание");
      return;
    }
    if (desc.length > 500) {
      toast.error("Описание слишком длинное (макс 500)");
      return;
    }
    if (!userId) {
      toast.error("Войдите, чтобы добавить трату");
      return;
    }
    if (!dayId) {
      toast.error("Выберите день");
      return;
    }
    if (splitUsers.size === 0) {
      toast.error("Выберите хотя бы одного участника");
      return;
    }

    const splitWithArr = Array.from(splitUsers).filter((id) => id !== userId);
    const excludeSelf = !splitUsers.has(userId);

    try {
      await addExpense.mutateAsync({
        amount: Math.round(amountUSD * 100) / 100,
        category,
        description: desc,
        paidById: userId,
        dayId,
        splitWith: splitWithArr,
        excludeSelf,
      });

      localStorage.setItem("triptrek-currency", currencyCode);

      if (splitWithArr.length > 0) {
        const splitCount = excludeSelf ? splitWithArr.length : splitWithArr.length + 1;
        const perPerson = (amountUSD / splitCount).toFixed(2);
        const names = trip?.participants
          .filter((p) => splitWithArr.includes(p.id))
          .map((p) => p.name)
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
    } catch (err) {
      toast.error("Не удалось добавить трату", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  const toggleUser = (id: string) => {
    setSplitUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSplitUsers(new Set(trip?.participants.map((p) => p.id) || []));
  };

  const splitCount = splitUsers.size > 0 ? splitUsers.size : 1;
  const perPerson = amountNum ? (amountNum / splitCount).toFixed(2) : "0";

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <DayPicker value={dayId} onChange={setDayId} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Сумма ({sym})</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base input-mobile"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Валюта</label>
          <select
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-2 py-2.5 text-base input-mobile max-w-[5.5rem]"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-2 py-2.5 text-base input-mobile"
          >
            {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.emoji} {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {currencyCode !== "USD" && amountNum > 0 && (
        <p className="text-[11px] text-muted-foreground">≈ ${amountUSD.toFixed(2)} USD</p>
      )}

      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Описание (например, Ужин)"
        maxLength={500}
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base input-mobile"
      />

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="size-3" /> За кого?
          </label>
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-primary font-medium active:scale-95 transition-transform min-h-11 px-2"
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
                type="button"
                onClick={() => toggleUser(p.id)}
                className={cn(
                  "w-full flex items-center gap-2 p-2 rounded-lg text-sm transition-colors active:scale-98 min-h-11",
                  "hover:bg-accent active:bg-accent",
                  checked && "bg-primary/10"
                )}
              >
                <div
                  className={cn(
                    "size-5 rounded-md border-2 grid place-items-center shrink-0 transition-colors",
                    checked ? "bg-primary border-primary" : "border-input"
                  )}
                >
                  {checked && <Check className="size-3 text-primary-foreground" />}
                </div>
                <div
                  className="size-6 rounded-full grid place-items-center text-[10px]"
                  style={{ background: p.color }}
                >
                  {p.emoji}
                </div>
                <span className="flex-1 text-left">{p.name}</span>
                {isPayer && (
                  <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ты</span>
                )}
              </button>
            );
          })}
          {splitUsers.size > 0 && (
            <div className="text-[11px] text-primary bg-primary/5 rounded-lg px-2 py-1.5 mt-1 border border-primary/20">
              {splitUsers.has(userId)
                ? splitUsers.size === 1
                  ? <>💡 Личная трата (без долгов)</>
                  : (
                      <>
                        💡 Доля каждого: <b>{sym}{perPerson}</b> ({splitCount} чел.)
                      </>
                    )
                : (
                    <>
                      💡 Каждый должен по <b>{sym}{perPerson}</b> тебе ({splitCount} чел.)
                    </>
                  )}
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
        type="button"
        onClick={submit}
        disabled={addExpense.isPending || splitUsers.size === 0 || !userId}
        className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {addExpense.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        Добавить трату
      </button>
    </div>
  );
}
