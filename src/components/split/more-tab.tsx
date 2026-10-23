"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KeyRound, Layers, Loader2, MoreHorizontal, Pause, Pencil, Play, Plus, Repeat, Settings, Trash2, UserPlus, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { describeActivity } from "@/lib/split/activity-text";
import { localDateKey } from "@/lib/split/dates";
import { formatCents } from "@/lib/split/money";
import { recurringLine } from "@/lib/split/recurrence-text";
import { SPLIT_CATEGORIES, categoryOf } from "@/lib/split/categories";
import type { SplitMemberDTO, SplitRecurringDTO } from "@/lib/split/types";
import { useDeleteRecurring, useSplitActivity, useToggleRecurring } from "@/hooks/split/use-split";
import type { GroupModel } from "@/hooks/split/use-group-model";
import { MemberAvatar, Money, PrimaryButton, SecondaryButton } from "./ui";

interface Props {
  model: GroupModel;
  onInvite: () => void;
  onAddMember: () => void;
  onEditMember: (m: SplitMemberDTO) => void;
  onNewRecurring: () => void;
  onEditRecurring: (r: SplitRecurringDTO) => void;
  onSettings: () => void;
  onNewGroup: () => void;
  onJoinByCode: () => void;
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card border border-border p-3">
      <div className="flex items-center justify-between gap-2 px-1 mb-1.5">
        <h2 className="font-semibold text-sm">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MoreTab({ model, onInvite, onAddMember, onEditMember, onNewRecurring, onEditRecurring, onSettings, onNewGroup, onJoinByCode }: Props) {
  const group = model.group!;
  const today = useMemo(() => localDateKey(), []);
  const toggle = useToggleRecurring(group.id);
  const delRecurring = useDeleteRecurring(group.id);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const activity = useSplitActivity(group.id, showActivity);

  const active = model.activeMembers;
  const former = [...model.membersById.values()].filter((m) => m.status !== "active" && (model.balances.get(m.id) ?? 0) !== 0);
  const nameOf = (id: string) => model.membersById.get(id)?.name ?? "Бывший участник";
  const items = activity.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-3">
      <Section
        title={`Участники · ${active.length}`}
        action={
          <button type="button" onClick={onSettings} className="inline-flex items-center gap-1 text-xs font-medium text-primary min-h-10 px-2 -mr-1" aria-label="Настройки группы">
            <Settings className="size-3.5" /> Настройки
          </button>
        }
      >
        <ul className="divide-y divide-border">
          {[...active, ...former].map((m) => {
            const b = model.balances.get(m.id) ?? 0;
            return (
              <li key={m.id}>
                <button type="button" onClick={() => onEditMember(m)} className="w-full flex items-center gap-2.5 px-1 py-2 min-h-14 text-left rounded-lg hover:bg-accent/40 active:bg-accent/60 transition-colors">
                  <MemberAvatar member={m} className="size-9" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {m.name}
                      {m.id === group.myMemberId && <span className="ml-1.5 text-[10px] font-medium text-primary">ты</span>}
                      {m.status !== "active" && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">вышел</span>}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {m.role === "owner" ? "Владелец" : m.userId === null ? "Без аккаунта" : "Участник"}
                    </span>
                  </span>
                  {b !== 0 && <Money cents={b} currency={group.currency} signed tone className="text-xs font-semibold" />}
                  <MoreHorizontal className="size-4 text-muted-foreground shrink-0" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2 mt-2">
          <PrimaryButton className="flex-1" onClick={onInvite}>
            <UserPlus className="size-4" /> Пригласить
          </PrimaryButton>
          <SecondaryButton className="flex-1" onClick={onAddMember}>
            <UserRoundPlus className="size-4" /> Без аккаунта
          </SecondaryButton>
        </div>
      </Section>

      <Section
        title="Повторяющиеся траты"
        action={
          <button type="button" onClick={onNewRecurring} className="inline-flex items-center gap-1 text-xs font-medium text-primary min-h-10 px-2 -mr-1">
            <Plus className="size-3.5" /> Добавить
          </button>
        }
      >
        {model.recurrings.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-2 leading-relaxed">
            Аренда, интернет, подписки — создай шаблон один раз, и трата будет появляться сама в нужное число каждого месяца.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {model.recurrings.map((r) => {
              const cat = SPLIT_CATEGORIES[categoryOf(r.category)];
              const payer = model.membersById.get(r.paidById);
              const pausedByMember = !r.active && (r.template.some((t) => model.membersById.get(t.memberId)?.status !== "active") || payer?.status !== "active");
              return (
                <li key={r.id} className={cn("py-2 px-1", !r.active && "opacity-70")}>
                  <div className="flex items-center gap-2.5">
                    <span className="size-9 rounded-xl grid place-items-center text-base shrink-0" style={{ background: `${cat.color}22` }} aria-hidden>
                      {cat.emoji}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{r.description}</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">
                        {recurringLine(r, today)} · платит {r.paidById === group.myMemberId ? "я" : (payer?.name ?? "—")}
                      </span>
                    </span>
                    {r.originalCurrency && r.originalAmountCents ? (
                      <span className="shrink-0 text-right">
                        <Money cents={r.originalAmountCents} currency={r.originalCurrency} className="block text-sm font-semibold" />
                        <span className="block text-[11px] text-muted-foreground tabular-nums">≈ {formatCents(r.amountCents, group.currency)}</span>
                      </span>
                    ) : (
                      <Money cents={r.amountCents} currency={group.currency} className="text-sm font-semibold" />
                    )}
                  </div>
                  {pausedByMember && <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 pl-11">Из шаблона вышел участник — поправь состав и включи снова.</p>}
                  <div className="flex gap-1.5 mt-1.5 pl-11">
                    <button
                      type="button"
                      onClick={() => toggle.mutate({ id: r.id, active: !r.active }, { onError: (e) => toast.error("Не получилось", { description: e instanceof Error ? e.message : undefined }) })}
                      disabled={toggle.isPending}
                      className="inline-flex items-center gap-1 min-h-9 px-2.5 rounded-lg border border-border text-xs hover:bg-muted active:scale-95 transition-transform"
                    >
                      {r.active ? <Pause className="size-3" /> : <Play className="size-3" />} {r.active ? "Пауза" : "Включить"}
                    </button>
                    <button type="button" onClick={() => onEditRecurring(r)} className="inline-flex items-center gap-1 min-h-9 px-2.5 rounded-lg border border-border text-xs hover:bg-muted active:scale-95 transition-transform">
                      <Pencil className="size-3" /> Изменить
                    </button>
                    {confirmDelete === r.id ? (
                      <button
                        type="button"
                        onClick={() =>
                          delRecurring.mutate(r.id, {
                            onSuccess: () => {
                              setConfirmDelete(null);
                              toast.success("Повтор удалён", { description: "Уже созданные траты остались" });
                            },
                            onError: (e) => toast.error("Не удалось удалить", { description: e instanceof Error ? e.message : undefined }),
                          })
                        }
                        className="inline-flex items-center gap-1 min-h-9 px-2.5 rounded-lg bg-destructive text-white text-xs font-medium"
                      >
                        {delRecurring.isPending && <Loader2 className="size-3 animate-spin" />} Удалить?
                      </button>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelete(r.id)} className="inline-flex items-center gap-1 min-h-9 px-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-destructive hover:bg-rose-500/10 active:scale-95 transition-colors" aria-label="Удалить повтор">
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Выход к другим группам: «Сочтёмся» открывается сразу в последней, хаб не на виду */}
      <Section title="Другие группы">
        <div className="grid grid-cols-1 gap-2">
          <Link href="/split?all=1" className="inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-xl bg-secondary text-foreground border border-border text-sm font-medium hover:bg-accent active:scale-[0.98] transition-[transform,background-color]">
            <Layers className="size-4" /> Все группы
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <SecondaryButton onClick={onNewGroup}>
              <Plus className="size-4" /> Новая группа
            </SecondaryButton>
            <SecondaryButton onClick={onJoinByCode}>
              <KeyRound className="size-4" /> По коду
            </SecondaryButton>
          </div>
        </div>
      </Section>

      <Section title="Журнал">
        {!showActivity ? (
          <SecondaryButton className="w-full" onClick={() => setShowActivity(true)}>
            <Repeat className="size-4 rotate-90" /> Показать, кто что менял
          </SecondaryButton>
        ) : activity.isLoading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : activity.isError ? (
          <div className="py-4 text-center text-xs text-muted-foreground space-y-2">
            <p>Не удалось загрузить журнал</p>
            <SecondaryButton onClick={() => activity.refetch()}>Повторить</SecondaryButton>
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-2">Пока пусто.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {items.map((a) => {
                const line = describeActivity(a, nameOf, group.currency);
                return (
                  <li key={a.id} className="flex gap-2.5 py-2 px-1 text-sm">
                    <span className="shrink-0 w-6 text-center" aria-hidden>
                      {line.emoji}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block leading-snug break-words">{line.text}</span>
                      <time className="block text-[11px] text-muted-foreground" dateTime={a.createdAt}>
                        {new Date(a.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </span>
                  </li>
                );
              })}
            </ul>
            {activity.hasNextPage && (
              <button type="button" onClick={() => activity.fetchNextPage()} disabled={activity.isFetchingNextPage} className="w-full min-h-11 text-xs font-medium text-primary inline-flex items-center justify-center gap-1.5">
                {activity.isFetchingNextPage && <Loader2 className="size-3.5 animate-spin" />} Показать ещё
              </button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
