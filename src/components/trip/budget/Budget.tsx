"use client";

import { useMemo, useState } from "react";
import { Plus, UserCircle, Pencil, Loader2, Wallet, ChevronDown } from "lucide-react";
import { useExpenses, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { useTripStore } from "@/lib/trip-store";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { currencySymbol } from "@/lib/currencies";
import { calculateBalances, calculateSettlements, calculateNetSpent, calculatePersonalSpend } from "@/lib/budget";
import { cn, plural, fmtMoney } from "@/lib/utils";
import { CurrencyConverter } from "../currency-converter";
import { BudgetPlanWidget } from "../budget-plan-widget";
import { RoutePlanCard } from "./RoutePlanCard";
import { BudgetHero } from "./BudgetHero";
import { BudgetAnalytics } from "./BudgetAnalytics";
import { ExpenseRow } from "./ExpenseRow";
import { AddExpenseForm } from "./AddExpenseForm";
import { ParticipantBudgetRow } from "./ParticipantBudgetRow";
import { BudgetEditModal } from "./BudgetEditModal";
import { SettlementSection } from "./SettlementSection";
import { MobileBottomSheet } from "../mobile-bottom-sheet";

const HISTORY_PREVIEW = 8;

type HistoryFilter = "all" | "mine" | "settlements";

/** Дней поездки осталось (включая сегодня). До старта — все дни, после финиша — null */
function daysLeftInTrip(startDate: string, totalDays: number, status?: string): number | null {
  if (status === "completed" || totalDays <= 0) return null;
  const now = new Date();
  const start = new Date(startDate);
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startUTC = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const diffDays = Math.floor((nowUTC - startUTC) / 86_400_000);
  if (diffDays >= totalDays) return null;
  return diffDays < 0 ? totalDays : totalDays - diffDays;
}

export function Budget() {
  const tripId = useCurrentTripId();
  const { data: expenses, isLoading: expensesLoading, error: expensesError, refetch: refetchExpenses } = useExpenses();
  const { data: trip, isLoading: tripLoading, error: tripError, refetch: refetchTrip } = useTrip();
  const { data: session } = useAuth();
  const { setTripSwitcherOpen } = useTripStore();
  const [showAdd, setShowAdd] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [showAllHistory, setShowAllHistory] = useState(false);
  // Скоуп аналитики: "all" — вся группа, "me" — текущий юзер, иначе userId участника
  const [scope, setScope] = useState<string>("all");
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";

  // useMemo: новые identity на каждый рендер перерисовывали recharts-графики
  // при любом чихе вкладки, включая ввод траты (аудит 2026-09-13).
  // Хуки — ДО всех ранних return'ов, иначе rules-of-hooks.
  const realExpenses = useMemo(
    () => (expenses ?? []).filter((e) => e.category !== "settlement"),
    [expenses]
  );

  // participant.id в /api/trip сериализуется как userId, поэтому сравним с paidById напрямую.
  // Мёртвый id (участник удалён, поездка сменилась) молча откатывается на «Все».
  const scopeUserId = useMemo(() => {
    if (scope === "me") return currentUserId || null;
    if (scope && scope !== "all") {
      return (trip?.participants ?? []).some((p) => p.id === scope) ? scope : null;
    }
    return null;
  }, [scope, currentUserId, trip?.participants]);

  // Персональные траты «по реальным деньгам» (см. lib/budget/personal): трата целиком у плательщика,
  // возвращённый долг переносит долю к вернувшему — в категориях/днях исходных трат.
  const personalByUser = useMemo(
    () => calculatePersonalSpend(expenses ?? [], (trip?.participants ?? []).map((p) => p.id)),
    [expenses, trip?.participants]
  );
  const myPersonal = scopeUserId ? personalByUser[scopeUserId] : undefined;

  const byCategory = useMemo(
    () =>
      Object.keys(EXPENSE_CATEGORIES)
        .map((key) => {
          const sum = myPersonal
            ? (myPersonal.byCategory[key] ?? 0)
            : realExpenses.filter((e) => e.category === key).reduce((s, e) => s + e.amount, 0);
          return {
            key,
            label: EXPENSE_CATEGORIES[key].label,
            emoji: EXPENSE_CATEGORIES[key].emoji,
            color: EXPENSE_CATEGORIES[key].color,
            value: sum,
          };
        })
        .filter((x) => x.value > 0),
    [realExpenses, myPersonal]
  );

  const dailyData = useMemo(
    () =>
      (trip?.days ?? [])
        .map((d) => {
          const sum = myPersonal
            ? (myPersonal.byDay[d.id] ?? 0)
            : realExpenses.filter((e) => e.dayId === d.id).reduce((s, e) => s + e.amount, 0);
          return { day: `Д${d.dayNumber}`, amount: Math.round(sum), city: d.city };
        })
        .filter((d) => d.amount > 0),
    [trip?.days, realExpenses, myPersonal]
  );

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">💰</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Выбери поездку, чтобы вести бюджет</p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
          >
            Мои поездки →
          </button>
        </div>
      </div>
    );
  }

  if (tripError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <p className="text-xs">Возможно поездка удалена или нет доступа</p>
        <button
          type="button"
          onClick={() => refetchTrip()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (expensesError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">💸</div>
        <p className="text-sm font-medium">Не удалось загрузить траты</p>
        <button
          type="button"
          onClick={() => refetchExpenses()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (tripLoading || expensesLoading || !expenses || !trip) {
    return (
      <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Загрузка бюджета…
      </div>
    );
  }

  const settlementCount = expenses.length - realExpenses.length;
  const totalSpent = realExpenses.reduce((s, e) => s + e.amount, 0);
  const remaining = trip.settings.totalBudget - totalSpent;
  const budgetPct = trip.settings.totalBudget > 0 ? (totalSpent / trip.settings.totalBudget) * 100 : 0;
  const daysLeft = daysLeftInTrip(trip.settings.startDate, trip.settings.totalDays, trip.trip?.status);

  const dayColor = (cityName: string) =>
    trip.days.find((d) => d.city === cityName)?.accentColor ?? "#0ea5e9";

  const balances = calculateBalances(expenses, trip.participants);
  const settlements = calculateSettlements(expenses, trip.participants);
  // Чистые траты каждого: траты из кошелька минус вернувшиеся переводы (см. SettlementSection)
  const netSpent = calculateNetSpent(expenses, trip.participants);
  const sym = currencySymbol(trip.settings.currency);

  const myCount = realExpenses.filter((e) => e.paidById === currentUserId).length;
  const filteredHistory = expenses.filter((e) => {
    if (historyFilter === "mine") return e.paidById === currentUserId && e.category !== "settlement";
    if (historyFilter === "settlements") return e.category === "settlement";
    return true;
  });
  const visibleHistory = showAllHistory ? filteredHistory : filteredHistory.slice(0, HISTORY_PREVIEW);
  const hiddenCount = filteredHistory.length - visibleHistory.length;

  const filterChips: { key: HistoryFilter; label: string; count: number }[] = [
    { key: "all", label: "Все", count: expenses.length },
    ...(currentUserId ? [{ key: "mine" as const, label: "Мои", count: myCount }] : []),
    ...(settlementCount > 0 ? [{ key: "settlements" as const, label: "Переводы", count: settlementCount }] : []),
  ];

  return (
    <div className="space-y-4 animate-fade-up">
      <BudgetHero
        totalSpent={totalSpent}
        totalBudget={trip.settings.totalBudget}
        budgetPct={budgetPct}
        remaining={remaining}
        currencySymbol={sym}
        daysLeft={daysLeft}
        onAddClick={() => setShowAdd(true)}
      />

      <BudgetPlanWidget />

      <RoutePlanCard />

      <BudgetAnalytics
        byCategory={byCategory}
        dailyData={dailyData}
        totalSpent={myPersonal ? myPersonal.total : totalSpent}
        dayColor={dayColor}
        currencySymbol={sym}
        // "me" оставляем как есть: по нему чип подсвечивается и подпись говорит «твоя доля»
        scope={scopeUserId ? scope : "all"}
        onScopeChange={setScope}
        participants={trip.participants}
        currentUserId={currentUserId}
      />

      <SettlementSection
        balances={balances}
        settlements={settlements}
        totalSpent={totalSpent}
        participantsCount={trip.participants.length}
        currencySymbol={sym}
      />

      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <UserCircle className="size-4" /> Бюджет каждого
          </h2>
          <button
            onClick={() => setShowBudgetModal(true)}
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1 min-h-[44px]"
          >
            <Pencil className="size-3" /> Настроить
          </button>
        </div>
        <div className="space-y-2">
          {trip.participants.map((p) => (
            <ParticipantBudgetRow
              key={p.id}
              participant={p}
              spent={netSpent[p.id] ?? 0}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2.5">
          Общий бюджет группы: {sym}{fmtMoney(trip.settings.totalBudget)} — сумма бюджетов участников.
          {" "}Потраченное учитывает вернувшиеся переводы.
        </p>
      </div>

      <BudgetEditModal open={showBudgetModal} onOpenChange={setShowBudgetModal} />

      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold text-sm">История трат</h2>
          <span className="text-xs text-muted-foreground">
            {realExpenses.length} {plural(realExpenses.length, "трата", "траты", "трат")}
            {settlementCount > 0 && (
              <span className="text-muted-foreground/70">
                {" "}
                · {settlementCount} {plural(settlementCount, "перевод", "перевода", "переводов")}
              </span>
            )}
          </span>
        </div>

        {expenses.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <div className="text-4xl">📝</div>
            <p className="text-sm font-medium">Пока нет трат</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Добавь первую трату — обед, билет, сувенир. Бюджет и расчёты между друзьями обновятся
              автоматически.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-[44px]"
            >
              <Plus className="size-3.5" /> Добавить первую трату
            </button>
          </div>
        ) : (
          <>
            {filterChips.length > 1 && (
              <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
                {filterChips.map((chip) => {
                  const active = historyFilter === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => { setHistoryFilter(chip.key); setShowAllHistory(false); }}
                      className={cn(
                        "shrink-0 flex items-center gap-1.5 px-3 min-h-9 rounded-full text-xs font-medium border transition-colors active:scale-95",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      {chip.label}
                      <span className={cn("tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground/70")}>
                        {chip.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {filteredHistory.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {historyFilter === "mine" ? "Здесь появятся траты, которые оплатишь ты" : "Переводов пока нет"}
              </p>
            ) : (
              <div className="space-y-1.5">
                {visibleHistory.map((e) => (
                  <ExpenseRow key={e.id} expense={e} participants={trip.participants} />
                ))}
              </div>
            )}

            {(hiddenCount > 0 || showAllHistory) && filteredHistory.length > HISTORY_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllHistory((v) => !v)}
                className="mt-2 w-full min-h-11 rounded-xl text-xs font-medium text-primary hover:bg-accent/50 flex items-center justify-center gap-1 transition-colors"
              >
                {showAllHistory ? "Свернуть" : `Показать ещё ${hiddenCount}`}
                <ChevronDown className={cn("size-3.5 transition-transform", showAllHistory && "rotate-180")} />
              </button>
            )}
          </>
        )}
      </div>

      <MobileBottomSheet
        open={showAdd}
        onOpenChange={setShowAdd}
        title="Новая трата"
        titleIcon={<Wallet className="size-5 text-primary" />}
      >
        <AddExpenseForm onDone={() => setShowAdd(false)} />
      </MobileBottomSheet>

      <CurrencyConverter />
    </div>
  );
}
