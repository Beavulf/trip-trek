"use client";

import { useEffect, useState } from "react";
import { Wallet, Plus, Users, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTrip, useAddExpense, useCurrency, useCurrentTripId } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { currencySelectOptions } from "@/lib/currencies";
import { getSavedCurrency, saveCurrency, clearSavedCurrency } from "@/lib/currency-pref";
import { StickySubmit } from "../quick-add/StickySubmit";

interface AddExpenseFormProps {
  onDone: () => void;
}

export function AddExpenseForm({ onDone }: AddExpenseFormProps) {
  const tripId = useCurrentTripId();
  const { data: trip } = useTrip();
  const add = useAddExpense();
  const { data: currency } = useCurrency();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";

  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(() => {
    if (typeof window === "undefined") return "USD";
    return getSavedCurrency(tripId) || "USD";
  });
  const [rememberCurrency, setRememberCurrency] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!getSavedCurrency(tripId);
  });
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const tripCurrency = trip?.settings?.currency;

  // Пока валюта не запомнена и пользователь не трогал селект — дефолтим к валюте поездки
  useEffect(() => {
    if (currencyTouched || !tripCurrency) return;
    if (getSavedCurrency(tripId)) return;
    setCurrencyCode(tripCurrency);
  }, [tripCurrency, tripId, currencyTouched]);
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [paidById, setPaidById] = useState(currentUserId || trip?.participants[0]?.id || "");
  // Форма монтируется только при открытом шите, когда trip уже в кэше —
  // дефолт дня берём initializer'ом: текущий день поездки, до старта — день 1.
  // «Без дня» раньше был дефолтом, и траты молча выпадали из аналитики по дням
  const [dayId, setDayId] = useState(() => {
    if (!trip?.days?.length) return "";
    return (
      trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ??
      trip.days[0]?.id ??
      ""
    );
  });
  // null = юзер ещё не трогал выбор → дефолт «на всех» выводим на рендере
  // (тот же приём, что в quick-add/ExpenseForm; аудит 2026-10-06)
  const [splitOverride, setSplitOverride] = useState<Set<string> | null>(null);

  const participants = trip?.participants ?? [];
  const splitUsers = splitOverride ?? new Set(participants.map((p) => p.id));

  const toggleUser = (id: string) => {
    const next = new Set(splitUsers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSplitOverride(next);
  };

  // "Выбрать всех"
  const selectAll = () => {
    setSplitOverride(new Set(participants.map(p => p.id)));
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

    // Сохраняем валюту если выбрана галочка (scoped по trip)
    if (rememberCurrency && tripId) {
      saveCurrency(tripId, currencyCode);
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
        // Сохраняем оригинальную сумму и валюту, чтобы показать «изначально 100 ¥» в истории трат.
        originalAmount: amountNum,
        originalCurrency: currencyCode,
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
    <div className="space-y-3">
      {/* Сумма + валюта — сразу в фокусе, крупные (аудит 2026-10-06: submit был
          за пределами первого экрана, поля шли вразнобой) */}
      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Сумма</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            enterKeyHint="done"
            placeholder="0"
            min="0"
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-2xl font-bold input-mobile"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Валюта</label>
          <select
            value={currencyCode}
            onChange={(e) => {
              setCurrencyCode(e.target.value);
              setCurrencyTouched(true);
            }}
            className="rounded-xl border border-input bg-background px-2 py-3.5 text-base input-mobile max-w-[5.5rem]"
          >
            {currencySelectOptions(tripCurrency).map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Конвертация + галочка запомнить */}
      <div className="flex items-center justify-between text-[11px] -mt-1">
        {currencyCode !== "USD" && amountNum > 0 ? (
          <span className="text-muted-foreground">
            ≈ <b className="text-foreground">${amountUSD.toFixed(2)}</b> по курсу {usdRate.toFixed(2)}
          </span>
        ) : (
          <span />
        )}
        <label className="flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform shrink-0 min-h-9">
          <input
            type="checkbox"
            checked={rememberCurrency}
            onChange={(e) => {
              setRememberCurrency(e.target.checked);
              if (!tripId) return;
              if (e.target.checked) {
                saveCurrency(tripId, currencyCode);
              } else {
                clearSavedCurrency(tripId);
              }
            }}
            className="size-3.5 accent-primary"
          />
          <span className="text-muted-foreground">Запомнить {currencyCode}</span>
        </label>
      </div>

      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Описание (например, Ужин в SoHo)"
        maxLength={500}
        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile"
      />

      {/* Категория — чипы: один тап вместо «select → системный шит → пункт» */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Категория</label>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
          {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => {
            const active = category === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setCategory(k)}
                aria-pressed={active}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full border text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                )}
              >
                <span aria-hidden>{v.emoji}</span>
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Кто заплатил */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
          <Wallet className="size-3" /> Кто заплатил?
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {participants.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPaidById(p.id)}
              aria-pressed={paidById === p.id}
              className={cn(
                "flex items-center gap-1.5 px-2.5 min-h-10 rounded-xl text-sm font-medium transition-colors active:scale-[0.97]",
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
        <div className="bg-background rounded-xl border border-input p-1.5 space-y-0.5">
          {participants.map((p) => {
            const checked = splitUsers.has(p.id);
            const isPayer = p.id === paidById;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleUser(p.id)}
                aria-pressed={checked}
                className={cn(
                  "w-full flex items-center gap-2 p-2 rounded-lg text-sm transition-colors active:scale-[0.98] min-h-11",
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

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <select value={dayId} onChange={(e) => setDayId(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm input-mobile min-h-11">
          <option value="">Без дня</option>
          {trip?.days.map((d) => (
            <option key={d.id} value={d.id}>День {d.dayNumber} · {d.city}</option>
          ))}
        </select>
      </div>

      <StickySubmit>
        <button
          type="button"
          onClick={submit}
          disabled={add.isPending}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 min-h-[48px] text-base font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Добавить трату
        </button>
      </StickySubmit>
    </div>
  );
}
