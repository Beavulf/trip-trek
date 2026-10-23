"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Plus, Repeat, Search, X } from "lucide-react";
import { cn, plural } from "@/lib/utils";
import { SPLIT_CATEGORIES, categoryOf } from "@/lib/split/categories";
import { localDateKey } from "@/lib/split/dates";
import {
  NO_FILTER,
  filterExpenses,
  groupExpensesByDay,
  isFiltering,
  myStake,
  type ExpenseFilter,
  type ExpenseScope,
} from "@/lib/split/expense-view";
import { myExpenseState, paymentsByExpense, type PaymentLink } from "@/lib/split/expense-settle";
import { formatCents } from "@/lib/split/money";
import type { SplitExpenseDTO } from "@/lib/split/types";
import { isTmpId } from "@/hooks/split/use-split";
import type { GroupModel } from "@/hooks/split/use-group-model";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { EmptyState, MemberAvatar, PrimaryButton, SecondaryButton, balanceTone } from "./ui";

const PAGE = 40;

const SCOPES: { value: ExpenseScope; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "owe", label: "Должен(на) я" },
  { value: "involved", label: "Меня касаются" },
  { value: "paid", label: "Платил(а) я" },
];

function ExpenseRow({ e, model, linked, onOpen }: { e: SplitExpenseDTO; model: GroupModel; linked: Map<string, PaymentLink[]>; onOpen: (e: SplitExpenseDTO) => void }) {
  const group = model.group!;
  const cat = SPLIT_CATEGORIES[categoryOf(e.category)];
  const payer = model.membersById.get(e.paidById);
  const stake = myStake(e, group.myMemberId);
  // Сколько из моей доли / из чужих долей ещё не вернули переводами «за эту трату» (перевод без привязки долю не закрывает)
  const settle = myExpenseState(e, linked.get(e.id), group.myMemberId);
  const saving = isTmpId(e.id);
  const sharers = e.shares.length;

  return (
    <button
      type="button"
      onClick={() => !saving && onOpen(e)}
      disabled={saving}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 min-h-[60px] text-left rounded-xl hover:bg-accent/50 active:bg-accent/70 transition-[background-color,opacity]",
        saving && "opacity-60"
      )}
    >
      <span className="size-10 rounded-xl grid place-items-center text-lg shrink-0" style={{ background: `${cat.color}22` }} aria-hidden>
        {cat.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">{e.description}</span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
          {payer && <MemberAvatar member={payer} className="size-3.5" />}
          <span className="truncate">
            {payer?.id === group.myMemberId ? "Я заплатил(а)" : `${payer?.name ?? "Бывший участник"} заплатил(а)`}
            {sharers > 1 && ` · на ${sharers}`}
            {e.originalCurrency && e.originalAmountCents ? ` · ${formatCents(e.originalAmountCents, e.originalCurrency)}` : ""}
          </span>
          {e.recurringId && <Repeat className="size-3 shrink-0 text-primary" aria-label="Повторяющаяся" />}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums">{formatCents(e.amountCents, group.currency)}</span>
        {(() => {
          // Подпись под суммой: что это значит лично для меня и закрыто ли переводом за эту трату
          let text = "тебя нет";
          let tone = "text-muted-foreground";
          if (saving) text = "Сохраняется…";
          else if (stake.kind === "lent" && settle.kind === "lent") {
            if (settle.remainingCents > 0) {
              text = `тебе ${formatCents(settle.remainingCents, group.currency, { sign: true })}`;
              tone = balanceTone(1);
            } else {
              text = "вернули ✓";
            }
          } else if (stake.kind === "borrowed" && settle.kind === "owe") {
            if (settle.remainingCents > 0) {
              text = `ты ${formatCents(-settle.remainingCents, group.currency)}`;
              tone = balanceTone(-1);
            } else {
              text = "оплачено ✓";
              tone = balanceTone(1);
            }
          } else if (stake.kind === "self") text = "за себя";
          return <span className={cn("block text-[11px] tabular-nums", tone)}>{text}</span>;
        })()}
      </span>
    </button>
  );
}

export function ExpensesTab({
  model,
  onOpen,
  onAdd,
  canAdd,
}: {
  model: GroupModel;
  onOpen: (e: SplitExpenseDTO) => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  const group = model.group!;
  const [filter, setFilter] = useState<ExpenseFilter>(NO_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const today = useMemo(() => localDateKey(), []);

  const linked = useMemo(() => paymentsByExpense(model.payments), [model.payments]);
  const filtered = useMemo(() => filterExpenses(model.expenses, filter, group.myMemberId, linked), [model.expenses, filter, group.myMemberId, linked]);
  const shown = filtered.slice(0, limit);
  const days = useMemo(() => groupExpensesByDay(shown, today), [shown, today]);
  const usedCategories = useMemo(() => [...new Set(model.expenses.map((e) => categoryOf(e.category)))], [model.expenses]);

  const patch = (p: Partial<ExpenseFilter>) => {
    setFilter((f) => ({ ...f, ...p }));
    setLimit(PAGE);
  };

  if (model.expenses.length === 0) {
    return (
      <EmptyState emoji="🧾" title="Пока нет трат" text="Добавь первую трату — кто заплатил и на кого делить. Баланс посчитается сам.">
        {canAdd && (
          <PrimaryButton onClick={onAdd}>
            <Plus className="size-4" /> Добавить трату
          </PrimaryButton>
        )}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      {/* Поиск и фильтры */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden />
          <input
            type="search"
            value={filter.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="Поиск по тратам"
            aria-label="Поиск по тратам"
            className="w-full rounded-xl border border-input bg-card pl-9 pr-9 py-2.5 text-sm input-mobile focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          {filter.query && (
            <button type="button" onClick={() => patch({ query: "" })} aria-label="Очистить поиск" className="absolute right-1 top-1/2 -translate-y-1/2 size-9 grid place-items-center rounded-full text-muted-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={filter.scope === s.value}
              onClick={() => patch({ scope: s.value })}
              className={cn(
                "shrink-0 min-h-9 px-3 rounded-full text-xs font-medium border transition-colors active:scale-95",
                filter.scope === s.value ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
          {usedCategories.length > 1 && (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-pressed={filter.category !== null}
              onClick={() => setCategoryOpen(true)}
              className={cn(
                "shrink-0 inline-flex items-center gap-1 min-h-9 px-3 rounded-full text-xs font-medium border transition-colors active:scale-95",
                filter.category ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {filter.category ? `${SPLIT_CATEGORIES[filter.category].emoji} ${SPLIT_CATEGORIES[filter.category].label}` : "Категория"}
              <ChevronDown className="size-3" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState emoji="🔎" title="Ничего не найдено" text="Попробуй другой запрос или сбрось фильтры.">
          {isFiltering(filter) && <SecondaryButton onClick={() => patch(NO_FILTER)}>Сбросить</SecondaryButton>}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {days.map((d) => (
            <section key={d.key} aria-label={d.label}>
              <div className="flex items-baseline justify-between px-3 pb-1">
                <h3 className="text-xs font-semibold text-muted-foreground">{d.label}</h3>
                <span className="text-xs text-muted-foreground tabular-nums">{formatCents(d.totalCents, group.currency)}</span>
              </div>
              <div className="rounded-2xl bg-card border border-border p-1">
                {d.items.map((e) => (
                  <ExpenseRow key={e.id} e={e} model={model} linked={linked} onOpen={onOpen} />
                ))}
              </div>
            </section>
          ))}
          {filtered.length > shown.length && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE)}
              className="w-full min-h-11 rounded-xl text-sm font-medium text-primary hover:bg-accent/50 transition-colors"
            >
              Показать ещё {Math.min(PAGE, filtered.length - shown.length)} из {filtered.length - shown.length}
            </button>
          )}
          <p className="text-center text-[11px] text-muted-foreground pb-2">
            {filtered.length} {plural(filtered.length, "трата", "траты", "трат")}
          </p>
        </div>
      )}

      <MobileBottomSheet open={categoryOpen} onOpenChange={setCategoryOpen} title="Категория" maxWidthClass="sm:max-w-sm">
        <ul className="space-y-1">
          {[null, ...usedCategories].map((k) => {
            const active = filter.category === k;
            const c = k ? SPLIT_CATEGORIES[k] : null;
            return (
              <li key={k ?? "all"}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    patch({ category: k });
                    setCategoryOpen(false);
                  }}
                  className={cn("w-full flex items-center gap-3 px-3 min-h-12 rounded-xl text-sm font-medium text-left transition-colors", active ? "bg-primary/10" : "hover:bg-accent/60")}
                >
                  <span className="size-8 rounded-lg grid place-items-center text-base" style={{ background: c ? `${c.color}22` : undefined }} aria-hidden>
                    {c ? c.emoji : "🗂️"}
                  </span>
                  <span className="flex-1">{c ? c.label : "Все категории"}</span>
                  {active && <span className="text-primary text-xs">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </MobileBottomSheet>
    </div>
  );
}
