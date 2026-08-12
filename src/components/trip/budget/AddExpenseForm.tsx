"use client";

import { useState } from "react";
import { Wallet, Plus, Users, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTrip, useAddExpense, useCurrency } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { CURRENCIES } from "@/lib/currencies";

interface AddExpenseFormProps {
  onDone: () => void;
}

export function AddExpenseForm({ onDone }: AddExpenseFormProps) {
  const { data: trip } = useTrip();
  const add = useAddExpense();
  const { data: currency } = useCurrency();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";

  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(() => {
    if (typeof window === "undefined") return "USD";
    return localStorage.getItem("triptrek-currency") || "USD";
  });
  const [rememberCurrency, setRememberCurrency] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem("triptrek-currency");
  });
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [paidById, setPaidById] = useState(currentUserId || trip?.participants[0]?.id || "");
  const [dayId, setDayId] = useState("");
  // splitUsers — кто участвует в трате. По умолчанию НИКТО не выбран
  const [splitUsers, setSplitUsers] = useState<Set<string>>(new Set());

  const toggleUser = (id: string) => {
    setSplitUsers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // "Выбрать всех"
  const selectAll = () => {
    const all = new Set(trip?.participants.map(p => p.id) || []);
    setSplitUsers(all);
  };

  // Конвертация в USD
  const usdRate = currency?.rates?.[currencyCode] || 1;
  const amountNum = parseFloat(amount) || 0;
  const amountUSD = currencyCode === "USD" ? amountNum : amountNum / usdRate;

  const submit = async () => {
    if (!amountNum || !description.trim()) {
      toast.error("Заполните сумму и описание");
      return;
    }
    if (!paidById) {
      toast.error("Выберите кто заплатил");
      return;
    }
    if (splitUsers.size === 0) {
      toast.error("Выберите хотя бы одного участника траты");
      return;
    }

    // Сохраняем валюту если выбрана галочка
    if (rememberCurrency) {
      localStorage.setItem("triptrek-currency", currencyCode);
    }

    // splitWith = все участники КРОМЕ плательщика
    const splitWithArr = Array.from(splitUsers).filter(id => id !== paidById);
    // excludeSelf = плательщик НЕ в splitUsers (купил только для других)
    const excludeSelf = !splitUsers.has(paidById);

    try {
      await add.mutateAsync({
        amount: Math.round(amountUSD * 100) / 100,
        category,
        description: description.trim(),
        paidById,
        dayId: dayId || undefined,
        splitWith: splitWithArr,
        excludeSelf,
      });

      // Подсказка — только после реального успеха
      if (splitWithArr.length > 0) {
        const splitCount = excludeSelf ? splitWithArr.length : splitWithArr.length + 1;
        const perPerson = (amountUSD / splitCount).toFixed(2);
        const payer = trip?.participants.find(p => p.id === paidById);
        const names = trip?.participants
          .filter(p => splitWithArr.includes(p.id))
          .map(p => p.name)
          .join(", ");
        toast.success("Трата добавлена 💸", {
          description: excludeSelf
            ? `${names} должны по $${perPerson} → ${payer?.name || "тебе"}`
            : `Каждый должен $${perPerson} (включая ${payer?.name || "плательщика"})`,
          duration: 5000,
        });
      } else {
        const usdText = currencyCode !== "USD" ? ` (${amountNum} ${currencyCode} → $${amountUSD.toFixed(2)})` : "";
        toast.success("Трата добавлена 💸", { description: `$${amountUSD.toFixed(2)}${usdText}` });
      }
      setAmount(""); setDescription("");
      setSplitUsers(new Set());
      onDone();
    } catch (err) {
      toast.error("Не удалось добавить трату", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
      // НЕ закрываем форму — пусть пользователь видит что ввёл
    }
  };

  // Расчёт доли
  const splitCount = splitUsers.size > 0 ? splitUsers.size : 1;
  const perPersonUSD = amountUSD > 0 ? (amountUSD / splitCount).toFixed(2) : "0";

  return (
    <div className="space-y-2.5">
      <div className="bg-muted/40 rounded-xl p-3 space-y-2.5">
        {/* Сумма + валюта */}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Сумма"
            className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
          />
          <select
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
            className="rounded-lg border border-input bg-background px-2 py-2.5 text-sm font-medium"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
            ))}
          </select>
        </div>

        {/* Конвертация + галочка запомнить */}
        <div className="flex items-center justify-between text-[11px]">
          {currencyCode !== "USD" && amountNum > 0 ? (
            <span className="text-muted-foreground">
              ≈ <b className="text-foreground">${amountUSD.toFixed(2)}</b> по курсу {usdRate.toFixed(2)}
            </span>
          ) : (
            <span />
          )}
          <label className="flex items-center gap-1 cursor-pointer active:scale-95 transition-transform shrink-0">
            <input
              type="checkbox"
              checked={rememberCurrency}
              onChange={(e) => {
                setRememberCurrency(e.target.checked);
                if (e.target.checked) {
                  localStorage.setItem("triptrek-currency", currencyCode);
                } else {
                  localStorage.removeItem("triptrek-currency");
                }
              }}
              className="size-3.5 accent-primary"
            />
            <span className="text-muted-foreground">Запомнить {currencyCode}</span>
          </label>
        </div>

        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
          {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.emoji} {v.label}</option>
          ))}
        </select>
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
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95",
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

        {/* Участники траты */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-muted-foreground flex items-center gap-1">
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
              const isPayer = p.id === paidById;
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
                  {isPayer && <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">плательщик</span>}
                </button>
              );
            })}
            {splitUsers.size > 0 && (
              <div className="text-[11px] text-primary bg-primary/5 rounded-lg px-2 py-1.5 mt-1 border border-primary/20">
                {splitUsers.has(paidById)
                  ? splitUsers.size === 1
                    ? <>💡 Личная трата (без долгов)</>
                    : <>💡 Доля каждого: <b>${perPersonUSD}</b> ({splitCount} чел.)</>
                  : <>💡 Каждый должен по <b>${perPersonUSD}</b> плательщику ({splitCount} чел.)</>
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

        <select value={dayId} onChange={(e) => setDayId(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
          <option value="">Без дня</option>
          {trip?.days.map((d) => (
            <option key={d.id} value={d.id}>День {d.dayNumber} · {d.city}</option>
          ))}
        </select>

        <button
          onClick={submit}
          disabled={add.isPending}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium flex items-center justify-center gap-2 active:scale-98 transition-transform"
        >
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Добавить трату
        </button>
      </div>
    </div>
  );
}
