"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, RefreshCw } from "lucide-react";
import { cn, plural } from "@/lib/utils";
import { formatCents } from "@/lib/split/money";
import type { SplitExpenseDTO, SplitMemberDTO, SplitRecurringDTO } from "@/lib/split/types";
import { useAuth } from "@/hooks/use-auth";
import { forgetLastGroup, rememberLastGroup } from "@/lib/split/last-group";
import { useGroupModel } from "@/hooks/split/use-group-model";
import { useSplitSocket } from "@/hooks/split/use-split-socket";
import { BalanceTab } from "./balance-tab";
import { ExpenseDetailSheet } from "./expense-detail-sheet";
import { ExpenseSheet } from "./expense-sheet";
import { ExpensesTab } from "./expenses-tab";
import { GroupSettingsSheet } from "./group-settings-sheet";
import { InsightsTab } from "./insights-tab";
import { InviteSheet } from "./invite-sheet";
import { MemberSheet } from "./member-sheet";
import { MoreTab } from "./more-tab";
import { SettleSheet, type SettleTarget } from "./settle-sheet";
import { SplitShell } from "./split-shell";
import { AvatarStack, EmptyState, Segmented, SecondaryButton, balanceTone } from "./ui";

type Tab = "expenses" | "balance" | "insights" | "more";
const TABS: { value: Tab; label: string }[] = [
  { value: "expenses", label: "Траты" },
  { value: "balance", label: "Баланс" },
  { value: "insights", label: "Итоги" },
  { value: "more", label: "Ещё" },
];
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.value === v);

export function GroupScreen({
  groupId,
  quickAdd = false,
  onNoAccess,
}: {
  groupId: string;
  /** Страница быстрой траты: форма открывается сразу после загрузки (адрес остаётся /split/add) */
  quickAdd?: boolean;
  /** Группы нет или нет доступа (удалили, вышли): вызывающий решает, куда вести */
  onNoAccess?: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useAuth();
  const model = useGroupModel(groupId);
  useSplitSocket(useMemo(() => [groupId], [groupId]), session?.user?.id);

  const [tab, setTabState] = useState<Tab>(() => (isTab(params.get("tab")) ? (params.get("tab") as Tab) : "expenses"));
  // Вкладка живёт в адресе: пуш «тебе отдали» открывает сразу «Баланс», а обновление страницы не сбрасывает вкладку
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    url.searchParams.delete("invite");
    window.history.replaceState(null, "", url);
  }, []);

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editing, setEditing] = useState<SplitExpenseDTO | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<SplitRecurringDTO | null>(null);
  const [presetRepeat, setPresetRepeat] = useState(false);
  const [detail, setDetail] = useState<SplitExpenseDTO | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberEdit, setMemberEdit] = useState<SplitMemberDTO | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Сразу после создания группы (?invite=1) показываем приглашение — группа без людей бесполезна
  const wantsInvite = params.get("invite") === "1";
  // ?add=1 / страница /split/add — открыть форму траты сразу: добавить трату — самое частое действие
  const wantsAdd = quickAdd || params.get("add") === "1";
  const ready = model.status === "ready";

  // Группа открылась — она «последняя»: следующий вход в «Сочтёмся» приведёт сюда. Нет доступа — забываем
  useEffect(() => {
    if (ready) rememberLastGroup(groupId);
  }, [ready, groupId]);
  const noAccess = model.status === "error" && (model.errorStatus === 403 || model.errorStatus === 404);
  useEffect(() => {
    if (!noAccess) return;
    forgetLastGroup(groupId);
    onNoAccess?.();
  }, [noAccess, groupId, onNoAccess]);

  const addOpened = useRef(false);
  useEffect(() => {
    if (!wantsAdd || !ready || addOpened.current) return;
    addOpened.current = true;
    setEditing(null);
    setEditingRecurring(null);
    setPresetRepeat(false);
    setExpenseOpen(true);
    if (!quickAdd) {
      const url = new URL(window.location.href);
      url.searchParams.delete("add");
      window.history.replaceState(null, "", url);
    }
  }, [wantsAdd, ready, quickAdd]);
  useEffect(() => {
    if (wantsInvite && ready) {
      setInviteOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState(null, "", url);
    }
  }, [wantsInvite, ready]);

  const openNew = () => {
    setEditing(null);
    setEditingRecurring(null);
    setPresetRepeat(false);
    setExpenseOpen(true);
  };
  const openEdit = (e: SplitExpenseDTO) => {
    setDetail(null);
    setEditing(e);
    setEditingRecurring(null);
    setPresetRepeat(false);
    setExpenseOpen(true);
  };
  const openNewRecurring = () => {
    setEditing(null);
    setEditingRecurring(null);
    setPresetRepeat(true);
    setExpenseOpen(true);
  };
  const openEditRecurring = (r: SplitRecurringDTO) => {
    setEditing(null);
    setEditingRecurring(r);
    setPresetRepeat(false);
    setExpenseOpen(true);
  };
  const openSettle = (t: SettleTarget | null) => {
    setSettleTarget(t);
    setSettleOpen(true);
  };

  const { group } = model;

  // --- Состояния без данных ---
  if (model.status !== "ready" || !group) {
    return (
      <SplitShell title="Группа" backHref="/split?all=1">
        {model.status === "error" ? (
          <EmptyState emoji="🤔" title="Не удалось открыть группу" text="Возможно, группу удалили или тебя убрали из неё.">
            <SecondaryButton onClick={model.refetch}>
              <RefreshCw className="size-4" /> Повторить
            </SecondaryButton>
            <Link href="/split?all=1" className="inline-flex items-center justify-center min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              К моим группам
            </Link>
          </EmptyState>
        ) : (
          <div className="space-y-3" aria-busy="true" aria-label="Загрузка">
            <div className="h-24 rounded-3xl bg-muted animate-pulse" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        )}
      </SplitShell>
    );
  }

  const myBalance = model.myBalance;
  const activeCount = model.activeMembers.length;

  return (
    <SplitShell
      title={group.name}
      subtitle={`${activeCount} ${plural(activeCount, "участник", "участника", "участников")}`}
      lead={group.emoji}
      backHref="/split?all=1"
      tabs={<Segmented value={tab} onChange={setTab} options={TABS} size="sm" />}
    >
      {/* Моя позиция в группе: главный вопрос — «сколько я должен / мне должны» */}
      {tab === "expenses" && (
      <button
        type="button"
        onClick={() => setTab("balance")}
        className="w-full mb-4 rounded-2xl bg-card border border-border p-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
        aria-label="Открыть баланс"
      >
        <AvatarStack members={model.activeMembers} total={activeCount} />
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] text-muted-foreground">{myBalance > 0 ? "Тебе должны" : myBalance < 0 ? "Ты должен(на)" : "Твой баланс"}</span>
          <span className={cn("block text-lg font-bold tabular-nums", balanceTone(myBalance))}>
            {myBalance === 0 ? "Всё в расчёте" : formatCents(Math.abs(myBalance), group.currency)}
          </span>
        </span>
        <span className="text-xs font-medium text-primary shrink-0">Баланс →</span>
      </button>
      )}

      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
        {tab === "expenses" && <ExpensesTab model={model} onOpen={setDetail} onAdd={openNew} canAdd />}
        {tab === "balance" && <BalanceTab model={model} onSettle={openSettle} />}
        {tab === "insights" && <InsightsTab model={model} />}
        {tab === "more" && (
          <MoreTab
            model={model}
            onInvite={() => setInviteOpen(true)}
            onAddMember={() => {
              setMemberEdit(null);
              setMemberOpen(true);
            }}
            onEditMember={(m) => {
              setMemberEdit(m);
              setMemberOpen(true);
            }}
            onNewRecurring={openNewRecurring}
            onEditRecurring={openEditRecurring}
            onSettings={() => setSettingsOpen(true)}
          />
        )}
      </motion.div>

      {/* Добавить трату — главное действие экрана, под большим пальцем */}
      <motion.button
        type="button"
        onClick={openNew}
        whileTap={{ scale: 0.9 }}
        aria-label="Добавить трату"
        className="fixed z-40 right-4 sm:right-[max(1.5rem,calc(50%-21rem))] size-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-2xl shadow-emerald-500/40 grid place-items-center border-2 border-white/20"
        style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Plus className="size-8" strokeWidth={2.5} />
      </motion.button>

      <ExpenseSheet open={expenseOpen} onOpenChange={setExpenseOpen} model={model} editing={editing} recurring={editingRecurring} presetRepeat={presetRepeat} />
      <ExpenseDetailSheet expense={detail} onClose={() => setDetail(null)} onEdit={openEdit} model={model} />
      <SettleSheet open={settleOpen} onOpenChange={setSettleOpen} model={model} target={settleTarget} />
      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} group={group} />
      <MemberSheet open={memberOpen} onOpenChange={setMemberOpen} model={model} member={memberEdit} onLeft={() => { forgetLastGroup(groupId); router.replace("/split?all=1"); }} />
      <GroupSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} model={model} onDeleted={() => { forgetLastGroup(groupId); router.replace("/split?all=1"); }} />
    </SplitShell>
  );
}
