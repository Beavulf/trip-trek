"use client";

import { useRef, useState } from "react";
import { Pencil, Check, X, CalendarDays, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { budgetMeter } from "@/lib/budget/overview";
import { moneyExact, moneyWhole } from "@/lib/budget/format";
import { useUpdateTripBudget } from "@/hooks/use-trip";
import { AnimatedNumber } from "./AnimatedNumber";
import { BudgetMeter } from "./BudgetMeter";

interface BudgetHeroProps {
  totalSpent: number;
  totalBudget: number;
  currencySymbol?: string;
  /** Сколько дней поездки осталось (включая сегодня). null — темп не показываем */
  daysLeft?: number | null;
  /** Зритель деньги не правит: карандаш скрыт */
  canEdit?: boolean;
  /** Откуда общий бюджет: "members" — сумма личных бюджетов участников (см. /api/trip) */
  budgetSource?: "members" | "trip";
  /** При budgetSource="members" карандаш открывает бюджеты участников, а не правит общее поле */
  onEditMembers?: () => void;
  /** Мои траты и лимит; null — зритель или поездка в одиночку: личная строка совпала бы с общей */
  me?: { spent: number; budget: number | null } | null;
  /** Мои долги; null — считать не с кем */
  debts?: { iOwe: number; owedToMe: number } | null;
  /** Перейти к расчёту между друзьями */
  onShowDebts?: () => void;
}

// Шапка отвечает на три вопроса: сколько потратили, сколько потратил я и что с долгами.
// Цвета темнее брендового оранжевого: белый мелкий текст на orange-500 не набирает и 3:1.
export function BudgetHero({
  totalSpent,
  totalBudget,
  currencySymbol: sym = "$",
  daysLeft = null,
  canEdit = true,
  budgetSource = "trip",
  onEditMembers,
  me = null,
  debts = null,
  onShowDebts,
}: BudgetHeroProps) {
  const update = useUpdateTripBudget();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(totalBudget));
  // Почему поле закрылось: "cancel" — не сохранять, "save" — уже сохраняем.
  // Без него blur от клика по ✕ (или Escape) успевает вызвать save раньше onClick.
  const closeReason = useRef<"cancel" | "save" | null>(null);

  const openEditor = () => {
    closeReason.current = null;
    setVal(String(totalBudget));
    setEditing(true);
  };

  const save = () => {
    if (closeReason.current === "save" || update.isPending) return;
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) {
      toast.error("Введите корректную сумму");
      return;
    }
    closeReason.current = "save";
    update.mutate(num, {
      onSuccess: () => {
        toast.success("Бюджет обновлён");
        setEditing(false);
      },
      onError: (err) => {
        closeReason.current = null;
        toast.error("Не удалось обновить бюджет", {
          description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        });
      },
    });
  };

  const cancel = () => {
    closeReason.current = "cancel";
    setEditing(false);
  };

  const hasBudget = totalBudget > 0;
  const meter = budgetMeter(totalSpent, totalBudget);
  const over = meter.state === "over";
  const showPace = daysLeft !== null && daysLeft >= 1 && meter.remaining > 0 && hasBudget;
  // Общий бюджет = сумма личных: правка общего поля ничего бы не изменила (число считается из
  // участников), поэтому карандаш ведёт в их бюджеты
  const fromMembers = budgetSource === "members" && !!onEditMembers;
  const edit = fromMembers ? onEditMembers : openEditor;

  return (
    <section
      aria-label="Итог по бюджету"
      className={cn(
        "rounded-3xl bg-gradient-to-br p-4 text-white shadow-lg sm:p-5",
        over ? "from-rose-700 to-red-800" : "from-orange-700 to-rose-600"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white/90">Потрачено</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[2.625rem] font-bold leading-none tracking-tight tabular-nums">
              <AnimatedNumber value={totalSpent} format={(v) => moneyWhole(sym, v)} />
            </span>
            {editing ? (
              <span className="flex items-center gap-1.5">
                <span className="text-white/90">из {sym}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save();
                    if (e.key === "Escape") cancel();
                  }}
                  onBlur={() => {
                    // Флаг "cancel" одноразовый: если тап по ✕ сорвался и click не пришёл,
                    // следующий уход из поля снова должен сохранять
                    if (closeReason.current === "cancel") {
                      closeReason.current = null;
                      return;
                    }
                    save();
                  }}
                  autoFocus
                  aria-label="Бюджет поездки"
                  className="w-24 rounded-lg bg-white/15 px-2 py-1 text-lg font-bold tabular-nums outline-none placeholder:text-white/60"
                  placeholder="1100"
                />
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={save} disabled={update.isPending} aria-label="Сохранить бюджет" className="grid size-11 place-items-center rounded-xl bg-white/20 transition-[background-color,transform] hover:bg-white/30 active:scale-95 disabled:opacity-50">
                  <Check className="size-4" />
                </button>
                <button
                  type="button"
                  // pointerdown приходит раньше blur инпута — ставим флаг до того, как blur вызовет save
                  onPointerDown={(e) => {
                    e.preventDefault();
                    closeReason.current = "cancel";
                  }}
                  onClick={cancel}
                  aria-label="Отменить"
                  className="grid size-11 place-items-center rounded-xl bg-white/20 transition-[background-color,transform] hover:bg-white/30 active:scale-95"
                >
                  <X className="size-4" />
                </button>
              </span>
            ) : (
              hasBudget && <span className="text-lg font-medium text-white/90 tabular-nums">из {moneyWhole(sym, totalBudget)}</span>
            )}
          </div>
        </div>
        {!editing && canEdit && hasBudget && (
          <button
            type="button"
            onClick={edit}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15 transition-[background-color,transform] hover:bg-white/25 active:scale-95"
            title="Изменить бюджет"
            aria-label="Изменить бюджет"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </div>

      {hasBudget ? (
        <>
          <BudgetMeter
            meter={meter}
            animateIn
            className="mt-4 h-3 bg-black/20"
            fillClassName="bg-white"
            overClassName="bg-amber-300"
          />
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-white/90 tabular-nums">{meter.percent}% бюджета</span>
            {over ? (
              <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold text-red-700 tabular-nums">
                Перерасход {moneyWhole(sym, meter.overBy)}
              </span>
            ) : (
              <span className="font-semibold tabular-nums">Осталось {moneyWhole(sym, meter.remaining)}</span>
            )}
          </div>
          {showPace && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-white/90 tabular-nums">
              <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
              Можно тратить {moneyWhole(sym, Math.floor(meter.remaining / daysLeft!))} в день, ещё {daysLeft}{" "}
              {plural(daysLeft!, "день", "дня", "дней")}
            </div>
          )}
          {fromMembers && !editing && (
            <p className="mt-1.5 text-xs text-white/85">Бюджет: сумма бюджетов участников</p>
          )}
        </>
      ) : (
        !editing &&
        canEdit && (
          <button
            type="button"
            onClick={edit}
            className="mt-3 min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-orange-800 transition-transform active:scale-[0.98]"
          >
            Задать бюджет
          </button>
        )
      )}

      {(me || debts) && (
        <div className={cn("mt-4 grid divide-x divide-white/15 rounded-2xl bg-black/20", me && debts ? "grid-cols-2" : "grid-cols-1")}>
          {me && <MyShare me={me} sym={sym} />}
          {debts && <MyDebts debts={debts} sym={sym} onShow={onShowDebts} />}
        </div>
      )}
    </section>
  );
}

function MyShare({ me, sym }: { me: { spent: number; budget: number | null }; sym: string }) {
  const meter = budgetMeter(me.spent, me.budget);
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div className="text-xs text-white/85">Твои траты</div>
      <div className="mt-0.5 truncate text-sm font-semibold tabular-nums">
        {moneyWhole(sym, me.spent)}
        {meter.state !== "none" && <span className="font-normal text-white/90"> из {moneyWhole(sym, me.budget ?? 0)}</span>}
      </div>
      {meter.state !== "none" && (
        <div className="mt-0.5 text-xs text-white/90 tabular-nums">
          {meter.state === "over" ? `сверх лимита ${moneyWhole(sym, meter.overBy)}` : `осталось ${moneyWhole(sym, meter.remaining)}`}
        </div>
      )}
    </div>
  );
}

function MyDebts({
  debts,
  sym,
  onShow,
}: {
  debts: { iOwe: number; owedToMe: number };
  sym: string;
  onShow?: () => void;
}) {
  const hasDebts = debts.iOwe > 0 || debts.owedToMe > 0;
  if (!hasDebts) {
    return (
      <div className="min-w-0 px-3 py-2.5">
        <div className="text-xs text-white/85">Долги</div>
        <div className="mt-0.5 text-sm font-semibold">Всё закрыто</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onShow}
      className="flex min-w-0 items-center gap-1 rounded-r-2xl px-3 py-2.5 text-left transition-colors hover:bg-white/10"
    >
      <span className="min-w-0 flex-1 space-y-1">
        {debts.iOwe > 0 && <DebtLine label="С тебя" value={moneyExact(sym, debts.iOwe)} />}
        {debts.owedToMe > 0 && <DebtLine label="Тебе должны" value={moneyExact(sym, debts.owedToMe)} />}
      </span>
      <ChevronDown className="size-4 shrink-0 text-white/80" aria-hidden="true" />
    </button>
  );
}

function DebtLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="block">
      <span className="block text-xs text-white/85">{label}</span>
      <span className="block truncate text-sm font-semibold tabular-nums">{value}</span>
    </span>
  );
}
