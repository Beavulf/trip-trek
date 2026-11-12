"use client";

import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { isBeforeTripStart } from "@/lib/trip-days";
import type { Expense, Participant } from "@/lib/types";
import { ExpenseList } from "./ExpenseList";
import { EmptyState } from "../empty-state";

const PAGE = 30;

// «Общие» — с делением на участников, «личные» — только за себя (ретро-кейс
// 2026-10: половина трат поездки была личной, и их хотелось смотреть отдельно)
export type HistoryFilter = "all" | "mine" | "shared" | "personal" | "settlements";

const EMPTY: Record<HistoryFilter, { emoji: string; text: string }> = {
  mine: { emoji: "💸", text: "Здесь появятся траты, которые оплатишь ты" },
  shared: { emoji: "🤝", text: "Общих трат пока нет" },
  personal: { emoji: "🙈", text: "Личных трат пока нет" },
  settlements: { emoji: "🔁", text: "Переводов пока нет" },
  all: { emoji: "🧾", text: "Пока нет трат" },
};

interface ExpenseHistoryProps {
  expenses: Expense[];
  people: Participant[];
  sym: string;
  currentUserId: string;
  tripStartDate: string;
  filter: HistoryFilter;
  onFilterChange: (f: HistoryFilter) => void;
  showAll: boolean;
  onShowAllChange: (v: boolean) => void;
  /** Зритель трат не добавляет */
  onAdd?: () => void;
}

/** Раздел «Траты»: вся история с фильтрами, сгруппированная по дням */
export function ExpenseHistory({
  expenses,
  people,
  sym,
  currentUserId,
  tripStartDate,
  filter,
  onFilterChange,
  showAll,
  onShowAllChange,
  onAdd,
}: ExpenseHistoryProps) {
  if (expenses.length === 0) return <NoExpenses onAdd={onAdd} />;

  const isSettlement = (e: Expense) => e.category === "settlement";
  // Предпоездочная подготовка (билеты, брони): внесена до старта поездки.
  // Переводы сюда не входят — это не траты
  const isPreTrip = (e: Expense) => !isSettlement(e) && isBeforeTripStart(e.createdAt, tripStartDate);
  const isShared = (e: Expense) => !isSettlement(e) && !!e.splitWith?.trim();

  const real = expenses.filter((e) => !isSettlement(e));
  const settlementCount = expenses.length - real.length;
  const sharedCount = real.filter(isShared).length;
  const myCount = real.filter((e) => e.paidById === currentUserId).length;

  const filtered = expenses.filter((e) => {
    if (filter === "mine") return e.paidById === currentUserId && !isSettlement(e);
    if (filter === "settlements") return isSettlement(e);
    if (filter === "shared") return isShared(e);
    if (filter === "personal") return !isSettlement(e) && !e.splitWith?.trim();
    return true;
  });
  const visible = showAll ? filtered : filtered.slice(0, PAGE);
  const hiddenCount = filtered.length - visible.length;

  const chips: { key: HistoryFilter; label: string; count: number }[] = [
    { key: "all", label: "Все", count: expenses.length },
    { key: "shared", label: "Общие", count: sharedCount },
    { key: "personal", label: "Личные", count: real.length - sharedCount },
    ...(currentUserId ? [{ key: "mine" as const, label: "Мои", count: myCount }] : []),
    ...(settlementCount > 0 ? [{ key: "settlements" as const, label: "Переводы", count: settlementCount }] : []),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {/* Ширина сверху ограничена: на компьютере сумма в конце строки уезжала от названия на полэкрана */}
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 no-scrollbar sm:mx-0 sm:px-0" role="group" aria-label="Какие траты показать">
        {chips.map((chip) => {
          const active = filter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onFilterChange(chip.key);
                onShowAllChange(false);
              }}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-[background-color,color,transform] active:scale-95",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {chip.label}
              <span className={cn("tabular-nums", active ? "text-primary-foreground/85" : "text-muted-foreground")}>{chip.count}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-2 sm:p-3">
        {filtered.length === 0 ? (
          <EmptyState
            emoji={EMPTY[filter].emoji}
            title={EMPTY[filter].text}
            // «Записать трату» зовём только там, куда она логично ведёт: общий список и свой кошелёк
            cta={onAdd && filter === "all" ? { label: "Записать трату", onClick: onAdd } : undefined}
          />
        ) : filter === "all" && visible.some(isPreTrip) ? (
          // Предпоездочная подготовка визуально отделена от трат в поездке
          <div className="space-y-3">
            {visible.some((e) => !isPreTrip(e)) && (
              <Part title="В поездке">
                <ExpenseList expenses={visible.filter((e) => !isPreTrip(e))} participants={people} sym={sym} />
              </Part>
            )}
            <Part title="До поездки: билеты и брони">
              <ExpenseList expenses={visible.filter(isPreTrip)} participants={people} sym={sym} />
            </Part>
          </div>
        ) : (
          // Группы по дням + плавное появление/исчезновение строк: см. ExpenseList
          <ExpenseList expenses={visible} participants={people} sym={sym} />
        )}

        {(hiddenCount > 0 || showAll) && filtered.length > PAGE && (
          <button
            type="button"
            onClick={() => onShowAllChange(!showAll)}
            className="mt-1 flex min-h-11 w-full items-center justify-center gap-1 rounded-xl text-sm font-medium text-primary transition-colors hover:bg-accent/50"
          >
            {showAll ? "Свернуть" : `Показать ещё ${hiddenCount}`}
            <ChevronDown className={cn("size-4 transition-transform", showAll && "rotate-180")} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="px-2 pb-2 pt-1 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Пустой список: приглашение к первому действию (и в «Сводке», и в «Тратах») */
export function NoExpenses({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center">
      <p className="text-sm font-semibold">Пока нет трат</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-pretty text-muted-foreground">
        Добавьте первую: обед, билет, сувенир. Бюджет и долги посчитаются сами.
      </p>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
        >
          <Plus className="size-4" aria-hidden="true" /> Добавить первую трату
        </button>
      )}
    </div>
  );
}
