"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight, Wallet } from "lucide-react";
import { useExpenses, useTrip, useCurrentTripId } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { useTripStore, type BudgetView } from "@/lib/trip-store";
import { currencySymbol } from "@/lib/currencies";
import { daysLeftInTrip } from "@/lib/trip-days";
import { calculateBalances, calculateSettlements, calculateNetSpent, moneyParticipants } from "@/lib/budget";
import { myDebts } from "@/lib/budget/overview";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurrencyConverter } from "../currency-converter";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { AddExpenseForm } from "./AddExpenseForm";
import { BudgetEditModal } from "./BudgetEditModal";
import { BudgetHero } from "./BudgetHero";
import { BudgetSkeleton } from "./BudgetSkeleton";
import { ExpenseHistory, NoExpenses, type HistoryFilter } from "./ExpenseHistory";
import { ExpenseList } from "./ExpenseList";
import { PeopleBudgets } from "./PeopleBudgets";
import { SettlementSection } from "./SettlementSection";

// recharts (~344 KB) — самый тяжёлый статический импорт приложения; тянул
// графики в первый бандл «/» (холодный старт PWA). Лениво: чанк грузится при
// первом заходе в раздел «План», скелетон держит высоту без прыжка.
const BudgetPlanTab = dynamic(() => import("./BudgetPlanTab").then((m) => m.BudgetPlanTab), {
  ssr: false,
  loading: () => <div className="h-96 rounded-2xl border border-border bg-card animate-pulse" />,
});

const RECENT_COUNT = 5;

const VIEWS: { key: BudgetView; label: string }[] = [
  { key: "summary", label: "Сводка" },
  { key: "expenses", label: "Траты" },
  { key: "plan", label: "План" },
];

/**
 * Вкладка «Бюджет». Вместо ленты на пять экранов — три раздела под разные вопросы:
 * «Сводка» (как дела и кто кому должен), «Траты» (история), «План» (куда ушли деньги и совпало ли).
 * Бюджет на странице один — шапка «Сводки»; план только его разбивка (см. BudgetPlanTab).
 */
export function Budget() {
  const tripId = useCurrentTripId();
  const { data: expenses, isLoading: expensesLoading, error: expensesError, refetch: refetchExpenses } = useExpenses();
  const { data: trip, isLoading: tripLoading, error: tripError, refetch: refetchTrip } = useTrip();
  const { data: session } = useAuth();
  const { setTripSwitcherOpen, budgetView, setBudgetView, budgetAddOpen, setBudgetAddOpen } = useTripStore();
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [showAllHistory, setShowAllHistory] = useState(false);
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";

  // «Все траты» нажимают внизу «Сводки»: без прокрутки раздел открылся бы посреди чужого списка
  const openView = (view: BudgetView) => {
    setBudgetView(view);
    window.scrollTo({ top: 0 });
  };

  // Плавающий «+» просит форму через стор: уходим с вкладки — запрос не должен дожить до возврата
  useEffect(() => () => setBudgetAddOpen(false), [setBudgetAddOpen]);

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

  // Форма живёт и на экране ошибки трат: «+» виден всегда и не должен становиться мёртвой кнопкой
  const addSheet = (
    <MobileBottomSheet
      open={budgetAddOpen}
      onOpenChange={setBudgetAddOpen}
      title="Новая трата"
      titleIcon={<Wallet className="size-5 text-primary" />}
    >
      <AddExpenseForm onDone={() => setBudgetAddOpen(false)} />
    </MobileBottomSheet>
  );

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-orange-700 to-rose-600 text-white shadow-lg text-center">
          <div className="text-5xl mb-3" aria-hidden="true">💰</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/90 text-sm mt-1">Выбери поездку, чтобы вести бюджет</p>
          <button
            type="button"
            onClick={() => setTripSwitcherOpen(true)}
            className="mt-4 rounded-xl bg-white/20 px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
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
        <div className="text-3xl" aria-hidden="true">🤔</div>
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
        <div className="text-3xl" aria-hidden="true">💸</div>
        <p className="text-sm font-medium">Не удалось загрузить траты</p>
        <button
          type="button"
          onClick={() => refetchExpenses()}
          className="mt-2 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground min-h-11"
        >
          Обновить
        </button>
        {addSheet}
      </div>
    );
  }

  if (tripLoading || expensesLoading || !expenses || !trip) {
    return <BudgetSkeleton />;
  }

  const totalSpent = realExpenses.reduce((s, e) => s + e.amount, 0);
  const daysLeft = daysLeftInTrip(trip.settings.startDate, trip.settings.totalDays, trip.trip?.status);
  const balances = calculateBalances(expenses, people);
  const settlements = calculateSettlements(expenses, people);
  // Чистые траты каждого: траты из кошелька минус вернувшиеся переводы (см. SettlementSection)
  const netSpent = calculateNetSpent(expenses, people);
  // Зритель смотрит, но денег не правит (API режет мутации — не показываем кнопки, ведущие в 403)
  const canEdit = trip.participants.find((p) => p.id === currentUserId)?.role !== "viewer";
  const sym = currencySymbol(trip.settings.currency);
  const onAdd = canEdit ? () => setBudgetAddOpen(true) : undefined;
  const isGroup = people.length > 1;
  const me = people.find((p) => p.id === currentUserId);
  // Пока трат нет, блоки «твои траты» и «долгов нет» ничего не сообщают: на старте важнее задать бюджет
  const hasExpenses = expenses.length > 0;
  const showMoneyBlocks = isGroup && hasExpenses;

  return (
    <Tabs
      value={budgetView}
      onValueChange={(v) => openView(v as BudgetView)}
      className="gap-4 animate-fade-up"
    >
      <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-2xl p-1 lg:mx-auto lg:max-w-md">
        {VIEWS.map((v) => (
          <TabsTrigger
            key={v.key}
            value={v.key}
            className={cn(
              "min-h-11 rounded-xl text-sm font-semibold text-muted-foreground dark:text-muted-foreground",
              // В тёмной теме карточка темнее дорожки, и активный раздел выглядел вдавленным
              "data-[state=active]:bg-card data-[state=active]:text-foreground dark:data-[state=active]:bg-white/12 dark:data-[state=active]:border-transparent"
            )}
          >
            {v.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Смонтирована всегда: иначе каждый возврат заново считал сумму от нуля и сворачивал раскрытое */}
      <TabsContent value="summary" forceMount className="data-[state=inactive]:hidden">
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="min-w-0 space-y-4">
            <BudgetHero
              totalSpent={totalSpent}
              totalBudget={trip.settings.totalBudget}
              currencySymbol={sym}
              daysLeft={daysLeft}
              canEdit={canEdit}
              budgetSource={trip.settings.budgetSource}
              onEditMembers={() => setShowBudgetModal(true)}
              me={showMoneyBlocks && me ? { spent: netSpent[me.id] ?? 0, budget: me.budget } : null}
              debts={showMoneyBlocks && me ? myDebts(settlements, me.id) : null}
              onShowDebts={scrollToSettlement}
            />
            {showMoneyBlocks && (
              <SettlementSection
                balances={balances}
                settlements={settlements}
                participantsCount={people.length}
                currencySymbol={sym}
                currentUserId={currentUserId}
              />
            )}
          </div>

          <div className="min-w-0 space-y-4">
            {isGroup && (
              <PeopleBudgets
                people={people}
                netSpent={netSpent}
                sym={sym}
                currentUserId={currentUserId}
                canEdit={canEdit}
                onConfigure={() => setShowBudgetModal(true)}
                totalBudget={trip.settings.totalBudget}
                budgetSource={trip.settings.budgetSource}
              />
            )}

            {!hasExpenses ? (
              <NoExpenses onAdd={onAdd} />
            ) : (
              <section aria-labelledby="budget-recent-title" className="rounded-2xl border border-border bg-card p-2 sm:p-3">
                <div className="flex items-center justify-between gap-2 px-2 pt-1">
                  <h2 id="budget-recent-title" className="text-sm font-semibold">Последние траты</h2>
                  <button
                    type="button"
                    onClick={() => openView("expenses")}
                    className="-my-2 flex min-h-11 items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                  >
                    Все траты <ChevronRight className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-2">
                  <ExpenseList expenses={expenses.slice(0, RECENT_COUNT)} participants={people} sym={sym} />
                </div>
              </section>
            )}

            <ConverterCard />

            {/* Повседневные траты друзей живут отдельно от бюджета поездки — подсказываем, где их вести */}
            <Link
              href="/split"
              className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-[transform,border-color] hover:border-emerald-500/40 active:scale-[0.99]"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15" aria-hidden>
                🧾
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Траты на каждый день — в «Сочтёмся»</span>
                <span className="block text-xs text-pretty text-muted-foreground">Квартира, продукты, интернет: делите с друзьями, долги считаются сами</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="expenses">
        <ExpenseHistory
          expenses={expenses}
          people={people}
          sym={sym}
          currentUserId={currentUserId}
          tripStartDate={trip.settings.startDate}
          filter={historyFilter}
          onFilterChange={setHistoryFilter}
          showAll={showAllHistory}
          onShowAllChange={setShowAllHistory}
          onAdd={onAdd}
        />
      </TabsContent>

      <TabsContent value="plan">
        <BudgetPlanTab expenses={expenses} people={people} currentUserId={currentUserId} canEdit={canEdit} />
      </TabsContent>

      <BudgetEditModal open={showBudgetModal} onOpenChange={setShowBudgetModal} />
      {addSheet}
    </Tabs>
  );
}

/** Шапка липкая: отступ задаёт scroll-mt у самой карточки расчёта */
function scrollToSettlement() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("budget-settlement")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

// Конвертер нужен в дороге, но не каждую минуту: свёрнут в строку, а курсы запрашиваются только при открытии
function ConverterCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 rounded-2xl px-4 text-left text-sm font-semibold"
      >
        <span aria-hidden="true">💱</span> Конвертер валют
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <CurrencyConverter embedded />
        </div>
      )}
    </section>
  );
}
