"use client";

import { useEffect, useMemo, useState } from "react";
import { useTrip, useAddExpense, useCurrentTripId } from "@/hooks/use-trip";
import { useFormDraft } from "@/hooks/use-form-draft";
import { draftKey, readDraft, writeDraft } from "@/lib/form-draft";
import { useTripStore } from "@/lib/trip-store";
import { useRateFor } from "@/hooks/trip/use-currency";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { BASE_CURRENCY, currencySelectOptions, currencySymbol } from "@/lib/currencies";
import { expenseSelectableParticipants } from "@/lib/budget";
import { toBaseCurrency } from "@/lib/budget/convert";
import { FxHint } from "../fx-hint";
import { CategoryField } from "../budget/CategoryField";
import { getSavedCurrency, saveCurrency } from "@/lib/currency-pref";
import { Check, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn, fmtMoney } from "@/lib/utils";
import { DayPicker } from "./DayPicker";
import { DraftNotice } from "./DraftNotice";
import { StickySubmit } from "./StickySubmit";

interface ExpenseFormProps {
  userId: string;
  onDone: () => void;
}

/** Что переживает закрытие шита: сумма и текст — главное, остальное — контекст к ним. */
interface ExpenseDraft {
  amount: string;
  category: string;
  description: string;
  /** null — выбор не трогали: личная трата, только плательщик */
  split: string[] | null;
  dayId: string;
  currency: string;
}

// Черновик стоит сохранять, только если есть сумма или текст: одна «выбранная категория» — не набор
const isExpenseDraftEmpty = (d: ExpenseDraft): boolean => !d.amount.trim() && !d.description.trim();

export function ExpenseForm({ userId, onDone }: ExpenseFormProps) {
  const { data: trip } = useTrip();
  const tripId = useCurrentTripId();
  const addExpense = useAddExpense();
  const tripCurrency = trip?.settings?.currency;
  // Черновик прошлого открытия шита (случайный тап по фону, свайп приложения, перезагрузка)
  const storageKey = draftKey("expense", tripId, userId);
  const [draft] = useState(() => readDraft<ExpenseDraft>(storageKey));
  const [restored, setRestored] = useState(() => !!draft && !isExpenseDraftEmpty(draft));
  const [amount, setAmount] = useState(draft?.amount ?? "");
  const [currencyCode, setCurrencyCode] = useState(() => {
    if (draft?.currency) return draft.currency;
    if (typeof window === "undefined") return "USD";
    return getSavedCurrency(tripId) || "USD";
  });
  const [currencyTouched, setCurrencyTouched] = useState(!!draft?.currency);
  const [category, setCategory] = useState(draft?.category ?? "food");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [dayId, setDayId] = useState(draft?.dayId ?? "");
  // null = юзер ещё не трогал выбор → дефолт «только я» (личная трата) выводим на рендере,
  // без эффекта с setState. Раньше дефолтом были «все», и личную трату — самый частый случай —
  // приходилось отдельно «снимать» с остальных; делить её на других теперь осознанное действие
  const [splitOverride, setSplitOverride] = useState<Set<string> | null>(
    () => (draft?.split ? new Set(draft.split) : null)
  );

  useEffect(() => {
    if (!trip?.days?.length) return;
    if (dayId && trip.days.some((d) => d.id === dayId)) return;
    const today =
      trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id ??
      trip.days[0]?.id ??
      "";
    setDayId(today);
  }, [trip, dayId]);

  // Дефолт — валюта поездки, пока пользователь не выбрал свою
  useEffect(() => {
    if (currencyTouched || !tripCurrency) return;
    if (getSavedCurrency(tripId)) return;
    setCurrencyCode(tripCurrency);
  }, [tripCurrency, tripId, currencyTouched]);

  // «За кого» до первого ручного выбора — только плательщик (я).
  // Зрители вне денег (см. lib/budget/people.ts)
  const participants = expenseSelectableParticipants(trip?.participants ?? []);
  // Выбор из черновика мог устареть (участник вышел из поездки) — берём только живых
  const splitUsers = splitOverride
    ? new Set([...splitOverride].filter((id) => participants.some((p) => p.id === id)))
    : new Set(userId ? [userId] : []);
  // В поездке в одиночку делить не с кем: блок «За кого?» только мешает
  const canSplit = participants.length > 1;

  // Конвертация в USD (единая валюта хранения). Нет курса — отправка заблокирована, а не «курс 1»
  const fx = useRateFor(currencyCode);
  const amountNum = parseFloat(amount) || 0;
  const amountUSD = toBaseCurrency(amountNum, currencyCode, fx.rates) ?? 0;
  const sym = currencySymbol(currencyCode);

  const draftValue = useMemo<ExpenseDraft>(
    () => ({
      amount,
      category,
      description,
      split: splitOverride ? [...splitOverride] : null,
      dayId,
      currency: currencyCode,
    }),
    [amount, category, description, splitOverride, dayId, currencyCode]
  );
  const { discard } = useFormDraft(storageKey, draftValue, isExpenseDraftEmpty);

  const clearAll = () => {
    discard();
    setAmount("");
    setDescription("");
    setSplitOverride(null);
    setRestored(false);
  };

  const submit = () => {
    // Без описания — название категории: сумма и категория — минимум для записи траты
    const desc = description.trim() || EXPENSE_CATEGORIES[category]?.label || "Трата";
    if (!amountNum) {
      toast.error("Укажите сумму");
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
    if (!fx.ready) {
      toast.error(`Курс ${currencyCode} ещё не загрузился`, { description: "Подожди секунду, повтори или выбери USD" });
      return;
    }

    const splitWithArr = Array.from(splitUsers).filter((id) => id !== userId);
    const excludeSelf = !splitUsers.has(userId);

    const payload = {
      amount: Math.round(amountUSD * 100) / 100,
      category,
      description: desc,
      paidById: userId,
      dayId,
      splitWith: splitWithArr,
      excludeSelf,
      // Исходная сумма и валюта — как в расширенной форме: в истории видно «≈ 100 ¥»
      originalAmount: amountNum,
      originalCurrency: currencyCode,
    };
    const snapshot = draftValue;
    const usd = amountUSD;
    const currency = currencyCode;

    // Оптимистично: форма очищается и шит закрывается сразу, трата уже видна в списке
    // (useAddExpense кладёт её в кэш до ответа сервера). Не сохранилась — возвращаем
    // набранное в черновик и предлагаем вернуться к форме, а не просим вводить заново
    clearAll();
    onDone();
    addExpense
      .mutateAsync(payload)
      .then(() => {
        saveCurrency(tripId, currency);
        if (splitWithArr.length > 0) {
          const splitCount = excludeSelf ? splitWithArr.length : splitWithArr.length + 1;
          const perPerson = (usd / splitCount).toFixed(2);
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
      })
      .catch((err) => {
        writeDraft(storageKey, snapshot);
        toast.error("Трата не сохранилась", {
          description: err instanceof Error ? err.message : "Проверьте связь и попробуйте ещё раз",
          action: { label: "Вернуть", onClick: () => useTripStore.getState().openQuickAdd("expense") },
          duration: 10_000,
        });
      });
  };

  const toggleUser = (id: string) => {
    const next = new Set(splitUsers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSplitOverride(next);
  };

  const selectAll = () => {
    setSplitOverride(new Set(participants.map((p) => p.id)));
  };

  const splitCount = splitUsers.size > 0 ? splitUsers.size : 1;
  const perPerson = amountNum ? (amountNum / splitCount).toFixed(2) : "0";

  return (
    <div className="space-y-3">
      {restored && <DraftNotice onClear={clearAll} />}
      {/* Порядок полей — по частоте использования: сумма сразу, день (авто)
          переехал вниз к submit (аудит 2026-10-06) */}
      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Сумма ({sym})</label>
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
            className="rounded-xl border border-input bg-background px-2 py-3.5 text-base input-mobile min-w-[6.5rem]"
          >
            {currencySelectOptions(tripCurrency).map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {currencyCode !== BASE_CURRENCY && amountNum > 0 && (
        <p className="text-[11px] -mt-1">
          <FxHint code={currencyCode} amountNum={amountNum} amountUSD={amountUSD} fx={fx} />
        </p>
      )}

      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={`Описание (по умолчанию «${EXPENSE_CATEGORIES[category]?.label ?? "Трата"}»)`}
        maxLength={500}
        className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile"
      />

      <CategoryField value={category} onChange={setCategory} />

      {canSplit && (
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="size-3" /> За кого?
          </label>
          <div className="flex items-center">
            {/* Личная трата одним тапом: без ручного снятия галочек с остальных */}
            <button
              type="button"
              onClick={() => setSplitOverride(new Set([userId]))}
              className="text-xs text-primary font-medium active:scale-95 transition-transform min-h-11 px-2"
            >
              Только я
            </button>
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-primary font-medium active:scale-95 transition-transform min-h-11 px-2"
            >
              Выбрать всех
            </button>
          </div>
        </div>
        <div className="bg-background rounded-xl border border-input p-1.5 space-y-0.5">
          {participants.map((p) => {
            const checked = splitUsers.has(p.id);
            const isPayer = p.id === userId;
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
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ты</span>
                )}
              </button>
            );
          })}
          {splitUsers.size > 0 && (
            <div className="text-[11px] text-primary bg-primary/5 rounded-lg px-2 py-1.5 mt-1 border border-primary/20">
              {splitUsers.has(userId)
                ? splitUsers.size === 1
                  ? <>💡 Личная трата, без долгов. Отметь остальных, чтобы поделить</>
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
      )}

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">День</label>
        <DayPicker value={dayId} onChange={setDayId} />
      </div>

      <StickySubmit>
        <button
          type="button"
          onClick={submit}
          disabled={addExpense.isPending || splitUsers.size === 0 || !userId || !fx.ready}
          className="w-full min-h-[48px] rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-transform active:scale-[0.98]"
        >
          {addExpense.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Добавить трату{amountUSD > 0 ? ` · $${amountUSD.toFixed(2)}` : ""}
        </button>
      </StickySubmit>
    </div>
  );
}
