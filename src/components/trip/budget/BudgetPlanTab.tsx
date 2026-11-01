"use client";

import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Loader2, Pencil } from "lucide-react";
import { useBudgetPlan, useRouteDays, useTrip } from "@/hooks/use-trip";
import { EXPENSE_CATEGORIES, type Expense, type Participant } from "@/lib/types";
import { calculatePersonalSpend, calculateRoutePlanByExpenseCategory } from "@/lib/budget";
import { budgetMeter, buildCategoryRows, type CategoryPlanRow } from "@/lib/budget/overview";
import { moneyWhole } from "@/lib/budget/format";
import { currencySymbol } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import { UserAvatar } from "../user-avatar";
import { BudgetMeter } from "./BudgetMeter";
import { CategoryPlanSheet } from "./CategoryPlanSheet";
import { RoutePlanCard } from "./RoutePlanCard";

const CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORIES);

// Категория вне справочника (старые данные, импорт) считается «Прочим»: иначе круг категорий
// не сходится с итогом «Потрачено»
const categoryKey = (c: string) => (c in EXPENSE_CATEGORIES ? c : "other");

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
} as const;

interface BudgetPlanTabProps {
  expenses: Expense[];
  people: Participant[];
  currentUserId: string;
  canEdit: boolean;
}

/**
 * Раздел «План»: куда ушли деньги и совпало ли это с планом. Раньше одни и те же категории
 * стояли двумя блоками («План vs Факт» и круг «Аналитики»), теперь круг только обзор,
 * а строки под ним показывают и факт, и план. Чанк ленивый: recharts грузится с этим разделом.
 *
 * План здесь не второй бюджет, а разбивка: «бюджет поездки» один, в шапке «Сводки». Поэтому
 * остатка от плана итогом нет — зелёное «осталось» спорило бы с «перерасходом» бюджета.
 */
export function BudgetPlanTab({ expenses, people, currentUserId, canEdit }: BudgetPlanTabProps) {
  const { data: trip } = useTrip();
  const { data: plans, isLoading: plansLoading } = useBudgetPlan();
  const { data: days, isLoading: routeLoading } = useRouteDays();
  // Скоуп: "all" — вся группа, "me" — текущий юзер, иначе userId участника
  const [scope, setScope] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const sym = currencySymbol(trip?.settings.currency);

  const real = useMemo(() => expenses.filter((e) => e.category !== "settlement"), [expenses]);
  const routePlan = useMemo(() => calculateRoutePlanByExpenseCategory(days ?? []), [days]);

  // Мёртвый id (участник удалён, поездка сменилась) молча откатывается на «Все»
  const scopeUserId = useMemo(() => {
    if (scope === "me") return currentUserId || null;
    return scope !== "all" && people.some((p) => p.id === scope) ? scope : null;
  }, [scope, currentUserId, people]);

  // Персональные траты «по реальным деньгам» (см. lib/budget/personal): трата целиком у плательщика,
  // возвращённый долг переносит долю к вернувшему — в категориях/днях исходных трат
  const personal = useMemo(() => {
    if (!scopeUserId) return undefined;
    return calculatePersonalSpend(expenses, people.map((p) => p.id))[scopeUserId];
  }, [expenses, people, scopeUserId]);

  const spentBy = useMemo(() => {
    const out: Record<string, number> = {};
    for (const key of CATEGORY_KEYS) out[key] = personal?.byCategory[key] ?? 0;
    if (!personal) {
      for (const e of real) out[categoryKey(e.category)] += e.amount;
    }
    return out;
  }, [real, personal]);

  // useMemo: новая ссылка на каждый рендер перерисовывала бы графики
  const daily = useMemo(
    () =>
      (trip?.days ?? [])
        .map((d) => {
          const sum = personal
            ? (personal.byDay[d.id] ?? 0)
            : real.filter((e) => e.dayId === d.id).reduce((s, e) => s + e.amount, 0);
          return { day: `Д${d.dayNumber}`, amount: Math.round(sum), city: d.city, color: d.accentColor ?? "#0ea5e9" };
        })
        .filter((d) => d.amount > 0),
    [trip?.days, real, personal]
  );

  const manualBy = useMemo(() => Object.fromEntries((plans ?? []).map((p) => [p.category, p.amount])), [plans]);
  const isPersonal = !!scopeUserId;
  const rows = buildCategoryRows(CATEGORY_KEYS, spentBy, isPersonal ? {} : manualBy, isPersonal ? {} : routePlan);
  const slices = rows.filter((r) => r.spent > 0);
  const totalSpent = personal ? personal.total : real.reduce((s, e) => s + e.amount, 0);
  const totalPlan = rows.reduce((s, r) => s + r.plan, 0);
  const tripBudget = trip?.settings.totalBudget ?? 0;
  const scopeName = scope === "me" ? null : (people.find((p) => p.id === scope)?.name ?? null);

  if (plansLoading || routeLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Считаем план…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {people.length > 1 && (
        <ScopeChips scope={isPersonal ? scope : "all"} onChange={setScope} people={people} currentUserId={currentUserId} />
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="budget-cats-title" className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="budget-cats-title" className="text-sm font-semibold">Категории</h2>
            {canEdit && !isPersonal && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="-my-2 -mr-1 flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-xs font-medium text-primary hover:underline"
              >
                <Pencil className="size-3.5" aria-hidden="true" /> Изменить план
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-pretty text-muted-foreground">
              {isPersonal
                ? scope === "me"
                  ? "Твоих трат пока нет"
                  : `Трат с участием ${scopeName ?? "участника"} пока нет`
                : "Здесь появятся траты по категориям и план на поездку"}
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-3 sm:gap-4">
                {slices.length > 0 && <CategoryDonut slices={slices} sym={sym} />}
                <dl className="min-w-0 flex-1 space-y-1 text-sm">
                  <Fact label="Потрачено" value={moneyWhole(sym, totalSpent)} strong />
                  {totalPlan > 0 && <Fact label="По плану" value={moneyWhole(sym, totalPlan)} />}
                  {!isPersonal && tripBudget > 0 && <Fact label="Бюджет" value={moneyWhole(sym, tripBudget)} />}
                </dl>
              </div>

              {!isPersonal && tripBudget > 0 && totalPlan > tripBudget && (
                <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-pretty text-amber-800 dark:text-amber-300">
                  План на {moneyWhole(sym, totalPlan - tripBudget)} больше бюджета поездки. Запас в категориях
                  не значит, что бюджет цел.
                </p>
              )}

              <ul className="mt-3 divide-y divide-border">
                {rows.map((row) => (
                  <CategoryRow key={row.key} row={row} sym={sym} showPlan={!isPersonal} />
                ))}
              </ul>
            </>
          )}

          {isPersonal && (
            <p className="mt-2 text-xs text-pretty text-muted-foreground">
              Общая трата считается у того, кто заплатил. Когда долг закрыт, доля переходит к тому, кто её потребил.
            </p>
          )}
        </section>

        <div className="min-w-0 space-y-4">
          {daily.length > 0 && <DaysCard daily={daily} sym={sym} />}
          {!isPersonal && <RoutePlanCard />}
        </div>
      </div>

      {canEdit && (
        <CategoryPlanSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          manualBy={manualBy}
          routeBy={routePlan}
          tripBudget={tripBudget}
          sym={sym}
        />
      )}
    </div>
  );
}

function ScopeChips({
  scope,
  onChange,
  people,
  currentUserId,
}: {
  scope: string;
  onChange: (s: string) => void;
  people: Participant[];
  currentUserId: string;
}) {
  const chip = (active: boolean) =>
    cn(
      "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-[background-color,color,transform] active:scale-95",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-secondary text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 no-scrollbar sm:mx-0 sm:px-0" role="group" aria-label="Чьи траты показать">
      <button type="button" aria-pressed={scope === "all"} onClick={() => onChange("all")} className={chip(scope === "all")}>
        Все
      </button>
      {people.some((p) => p.id === currentUserId) && (
        <button type="button" aria-pressed={scope === "me"} onClick={() => onChange("me")} className={chip(scope === "me")}>
          Мои
        </button>
      )}
      {people
        .filter((p) => p.id !== currentUserId)
        .map((p) => (
          <button key={p.id} type="button" aria-pressed={scope === p.id} onClick={() => onChange(p.id)} className={chip(scope === p.id)}>
            <UserAvatar name={p.name} emoji={p.emoji} color={p.color} avatarUrl={p.avatarUrl} className="size-5" textClassName="text-[10px]" />
            <span className="max-w-24 truncate">{p.name}</span>
          </button>
        ))}
    </div>
  );
}

function Fact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
      <dd className={cn("shrink-0 font-medium tabular-nums", strong && "text-base font-bold")}>{value}</dd>
    </div>
  );
}

function CategoryDonut({ slices, sym }: { slices: CategoryPlanRow[]; sym: string }) {
  const data = slices.map((s) => ({ ...EXPENSE_CATEGORIES[s.key], key: s.key, value: s.spent }));
  return (
    <div className="size-20 shrink-0 sm:size-24">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {/* Анимация выключена: recharts переигрывала её на каждую смену среза/рефетч,
              а маунт с анимацией фризил вход на вкладку (аудит 2026-10-02) */}
          <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius="65%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number, name: string) => [moneyWhole(sym, v), name]}
            contentStyle={TOOLTIP_STYLE}
            itemStyle={{ color: "var(--foreground)" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function CategoryRow({ row, sym, showPlan }: { row: CategoryPlanRow; sym: string; showPlan: boolean }) {
  const meta = EXPENSE_CATEGORIES[row.key];
  const meter = budgetMeter(row.spent, row.plan);
  const over = meter.state === "over";
  const hasPlan = showPlan && meter.state !== "none";

  return (
    <li className="py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-sm" aria-hidden="true">{meta.emoji}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{meta.label}</span>
        <span className="shrink-0 tabular-nums">
          <span className={cn("text-sm font-semibold", over && "text-red-600 dark:text-red-400")}>{moneyWhole(sym, row.spent)}</span>
          {hasPlan && <span className="text-xs text-muted-foreground"> из {moneyWhole(sym, row.plan)}</span>}
        </span>
      </div>
      <BudgetMeter
        // Без плана (и в личном срезе) полоса показывает долю категории в тратах
        meter={hasPlan ? meter : { state: "ok", fillPct: row.sharePct, limitPct: 100 }}
        className="mt-1.5 h-1.5 bg-muted"
        fillColor={meta.color}
        overClassName="bg-red-500"
      />
      <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground tabular-nums">
        <span>{row.sharePct}% трат</span>
        {hasPlan ? (
          over ? (
            <span className="font-medium text-red-600 dark:text-red-400">сверх плана {moneyWhole(sym, meter.overBy)}</span>
          ) : (
            <span>осталось {moneyWhole(sym, meter.remaining)}</span>
          )
        ) : (
          showPlan && <span>без плана</span>
        )}
      </div>
    </li>
  );
}

function DaysCard({ daily, sym }: { daily: { day: string; amount: number; city: string; color: string }[]; sym: string }) {
  const average = Math.round(daily.reduce((s, d) => s + d.amount, 0) / daily.length);
  return (
    <section aria-labelledby="budget-days-title" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="budget-days-title" className="text-sm font-semibold">По дням</h2>
        <span className="text-xs text-muted-foreground tabular-nums">в среднем {moneyWhole(sym, average)} в день</span>
      </div>
      <div className="mt-3 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daily} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip
              formatter={(v: number) => [moneyWhole(sym, v), "Потрачено"]}
              labelFormatter={(_, items) => {
                const point = items?.[0]?.payload as { day: string; city: string } | undefined;
                return point ? `${point.day}, ${point.city}` : "";
              }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "var(--foreground)" }}
              itemStyle={{ color: "var(--foreground)" }}
              cursor={{ fill: "var(--accent)" }}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false}>
              {daily.map((entry) => (
                <Cell key={entry.day} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
