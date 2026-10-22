"use client";

import { useMemo, useState } from "react";
import { Plus, UserCircle, Pencil, Wallet, ChevronDown } from "lucide-react";
import { useExpenses, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { useTripStore } from "@/lib/trip-store";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { currencySymbol } from "@/lib/currencies";
import { daysLeftInTrip, isBeforeTripStart } from "@/lib/trip-days";
import { calculateBalances, calculateSettlements, calculateNetSpent, calculatePersonalSpend, moneyParticipants } from "@/lib/budget";
import { cn, plural, fmtMoney } from "@/lib/utils";
import { CurrencyConverter } from "../currency-converter";
import { BudgetPlanWidget } from "../budget-plan-widget";
import { RoutePlanCard } from "./RoutePlanCard";
import { BudgetHero } from "./BudgetHero";
import dynamic from "next/dynamic";

// recharts (~344 KB) — самый тяжёлый статический импорт приложения; тянул
// графики вкладки «Бюджет» в первый бандл «/» (холодный старт PWA). Лениво:
// чанк грузится при заходе на Бюджет, скелетон держит высоту без прыжка.
const BudgetAnalytics = dynamic(() => import("./BudgetAnalytics").then((m) => m.BudgetAnalytics), {
  ssr: false,
  loading: () => <div className="h-72 rounded-2xl bg-card border border-border animate-pulse" />,
});
import { ExpenseList } from "./ExpenseList";
import { BudgetSkeleton } from "./BudgetSkeleton";
import { AddExpenseForm } from "./AddExpenseForm";
import { ParticipantBudgetRow } from "./ParticipantBudgetRow";
import { BudgetEditModal } from "./BudgetEditModal";
import { SettlementSection } from "./SettlementSection";
import { MobileBottomSheet } from "../mobile-bottom-sheet";

const HISTORY_PREVIEW = 8;

// Категория вне справочника (старые данные, импорт) считается «Прочим»: иначе круг категорий
// не сходится с итогом «Потрачено»
const categoryKey = (c: string) => (c in EXPENSE_CATEGORIES ? c : "other");

// «Общие» — с делением на участников, «личные» — только за себя (ретро-кейс
// 2026-10: половина трат поездки была личной, и их хотелось смотреть отдельно)
type HistoryFilter = "all" | "mine" | "shared" | "personal" | "settlements";

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

  // «Участники денег»: активные не-зрители + все, кто фигурирует в тратах (в т.ч. вышедшие).
  // Расчёт долгов обязан идти по ним, а не по голому trip.participants: иначе доли и траты
  // ушедшего участника исчезают из балансов (см. lib/budget/people.ts)
  const people = useMemo(
    () => moneyParticipants(trip?.participants ?? [], trip?.formerParticipants, expenses ?? []),
    [trip?.participants, trip?.formerParticipants, expenses]
  );

  // participant.id в /api/trip сериализуется как userId, поэтому сравним с paidById напрямую.
  // Мёртвый id (участник удалён, поездка сменилась) молча откатывается на «Все».
  const scopeUserId = useMemo(() => {
    if (scope === "me") return currentUserId || null;
    if (scope && scope !== "all") {
      return people.some((p) => p.id === scope) ? scope : null;
    }
    return null;
  }, [scope, currentUserId, people]);

  // Персональные траты «по реальным деньгам» (см. lib/budget/personal): трата целиком у плательщика,
  // возвращённый долг переносит долю к вернувшему — в категориях/днях исходных трат.
  const personalByUser = useMemo(
    () => calculatePersonalSpend(expenses ?? [], people.map((p) => p.id)),
    [expenses, people]
  );
  const myPersonal = scopeUserId ? personalByUser[scopeUserId] : undefined;

  const byCategory = useMemo(
    () =>
      Object.keys(EXPENSE_CATEGORIES)
        .map((key) => {
          const sum = myPersonal
            ? (myPersonal.byCategory[key] ?? 0)
            : realExpenses.filter((e) => categoryKey(e.category) === key).reduce((s, e) => s + e.amount, 0);
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
    return <BudgetSkeleton />;
  }

  const settlementCount = expenses.length - realExpenses.length;
  const totalSpent = realExpenses.reduce((s, e) => s + e.amount, 0);
  const remaining = trip.settings.totalBudget - totalSpent;
  const budgetPct = trip.settings.totalBudget > 0 ? (totalSpent / trip.settings.totalBudget) * 100 : 0;
  const daysLeft = daysLeftInTrip(trip.settings.startDate, trip.settings.totalDays, trip.trip?.status);

  const dayColor = (cityName: string) =>
    trip.days.find((d) => d.city === cityName)?.accentColor ?? "#0ea5e9";

  const balances = calculateBalances(expenses, people);
  const settlements = calculateSettlements(expenses, people);
  // Чистые траты каждого: траты из кошелька минус вернувшиеся переводы (см. SettlementSection)
  const netSpent = calculateNetSpent(expenses, people);
  // Зритель смотрит, но денег не правит (API режет мутации — не показываем кнопки, ведущие в 403)
  const canEdit = trip.participants.find((p) => p.id === currentUserId)?.role !== "viewer";
  const sym = currencySymbol(trip.settings.currency);

  const isSettlement = (e: (typeof expenses)[number]) => e.category === "settlement";
  // Предпоездочная подготовка (билеты, брони): внесена до старта поездки.
  // Переводы сюда не входят — это не траты
  const isPreTrip = (e: (typeof expenses)[number]) =>
    !isSettlement(e) && isBeforeTripStart(e.createdAt, trip.settings.startDate);
  const isShared = (e: (typeof expenses)[number]) => !isSettlement(e) && !!e.splitWith?.trim();

  const myCount = realExpenses.filter((e) => e.paidById === currentUserId).length;
  const sharedCount = realExpenses.filter(isShared).length;
  const personalCount = realExpenses.length - sharedCount;
  const filteredHistory = expenses.filter((e) => {
    if (historyFilter === "mine") return e.paidById === currentUserId && e.category !== "settlement";
    if (historyFilter === "settlements") return e.category === "settlement";
    if (historyFilter === "shared") return isShared(e);
    if (historyFilter === "personal") return !isSettlement(e) && !e.splitWith?.trim();
    return true;
  });
  const visibleHistory = showAllHistory ? filteredHistory : filteredHistory.slice(0, HISTORY_PREVIEW);
  const hiddenCount = filteredHistory.length - visibleHistory.length;

  const filterChips: { key: HistoryFilter; label: string; count: number }[] = [
    { key: "all", label: "Все", count: expenses.length },
    { key: "shared", label: "Общие", count: sharedCount },
    { key: "personal", label: "Личные", count: personalCount },
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
        onAddClick={canEdit ? () => setShowAdd(true) : undefined}
        canEdit={canEdit}
        budgetSource={trip.settings.budgetSource}
        onEditMembers={() => setShowBudgetModal(true)}
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
        participants={people}
        currentUserId={currentUserId}
      />

      <SettlementSection
        balances={balances}
        settlements={settlements}
        participantsCount={people.length}
        currencySymbol={sym}
        currentUserId={currentUserId}
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
          {people.map((p) => (
            <ParticipantBudgetRow
              key={p.id}
              participant={p}
              spent={netSpent[p.id] ?? 0}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2.5">
          {trip.settings.budgetSource === "members"
            ? `Общий бюджет группы: ${sym}${fmtMoney(trip.settings.totalBudget)} — сумма бюджетов участников.`
            : trip.settings.totalBudget > 0
              ? `Общий бюджет группы: ${sym}${fmtMoney(trip.settings.totalBudget)} — задан вручную (бюджеты участников заполнены не у всех).`
              : "Общий бюджет не задан."}
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
              <span className="text-muted-foreground/80">
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
            {canEdit && (
              <button
                onClick={() => setShowAdd(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-[44px]"
              >
                <Plus className="size-3.5" /> Добавить первую трату
              </button>
            )}
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
                      <span className={cn("tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground/80")}>
                        {chip.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {filteredHistory.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {{
                  mine: "Здесь появятся траты, которые оплатишь ты",
                  shared: "Общих трат пока нет",
                  personal: "Личных трат пока нет",
                  settlements: "Переводов пока нет",
                  all: "Пока нет трат",
                }[historyFilter]}
              </p>
            ) : historyFilter === "all" && visibleHistory.some(isPreTrip) ? (
              // Предпоездочная подготовка визуально отделена от трат в поездке
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground pt-1">
                  До поездки · билеты и брони
                </div>
                <ExpenseList expenses={visibleHistory.filter(isPreTrip)} participants={people} sym={sym} />
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground pt-1.5">
                  В поездке
                </div>
                <ExpenseList expenses={visibleHistory.filter((e) => !isPreTrip(e))} participants={people} sym={sym} />
              </div>
            ) : (
              // Группы по дням + плавное появление/исчезновение строк: см. ExpenseList
              <ExpenseList expenses={visibleHistory} participants={people} sym={sym} />
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
