"use client";

import { useState } from "react";
import { Check, HandCoins, Loader2, Pencil, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SPLIT_CATEGORIES, categoryOf } from "@/lib/split/categories";
import { dayLabel, localDateKey } from "@/lib/split/dates";
import { expenseSettlement, nettedShareMark, type NettedShareMark } from "@/lib/split/expense-settle";
import { itemsFromExpense } from "@/lib/split/expense-form";
import { myStake } from "@/lib/split/expense-view";
import { formatRate } from "@/lib/split/fx";
import { formatCents } from "@/lib/split/money";
import type { SplitExpenseDTO } from "@/lib/split/types";
import { useDeleteExpense, useSaveExpense } from "@/hooks/split/use-split";
import type { GroupModel } from "@/hooks/split/use-group-model";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SettleTarget } from "./settle-sheet";
import { MemberAvatar, Money, SecondaryButton, balanceTone } from "./ui";
import { cn } from "@/lib/utils";

interface Props {
  expense: SplitExpenseDTO | null;
  onClose: () => void;
  onEdit: (e: SplitExpenseDTO) => void;
  /** «Перевёл(а)» / «Получил(а)» по доле в этой трате: открывает запись перевода, привязанного к трате */
  onSettle: (target: SettleTarget) => void;
  model: GroupModel;
}

const MODE_LABEL = { equal: "поровну", exact: "точные суммы", shares: "по долям", percent: "в процентах" } as const;

export function ExpenseDetailSheet({ expense, onClose, onEdit, onSettle, model }: Props) {
  // Последняя открытая трата держится, пока шит уезжает вниз: иначе содержимое схлопывается раньше анимации
  const [shown, setShown] = useState<SplitExpenseDTO | null>(expense);
  if (expense && expense !== shown) setShown(expense);
  const group = model.group!;
  const del = useDeleteExpense(group.id);
  const restore = useSaveExpense(group.id, group.myMemberId);
  const [confirming, setConfirming] = useState(false);
  // Отметка перевода по доле, чей долг уже перекрыт нетто-балансом пары: перед записью предупреждаем
  const [pendingSettle, setPendingSettle] = useState<{ target: SettleTarget; warn: NettedShareMark } | null>(null);

  const e = expense ?? shown;
  const open = expense !== null;

  const remove = async () => {
    if (!e) return;
    const snapshot = e;
    try {
      await del.mutateAsync(snapshot.id);
      setConfirming(false);
      onClose();
      toast("Трата удалена", {
        action: {
          label: "Вернуть",
          onClick: () =>
            restore.mutate({
              form: {
                amountCents: snapshot.amountCents,
                original:
                  snapshot.originalCurrency && snapshot.originalAmountCents
                    ? { amountCents: snapshot.originalAmountCents, currency: snapshot.originalCurrency }
                    : null,
                description: snapshot.description,
                category: snapshot.category,
                paidById: snapshot.paidById,
                spentOn: snapshot.spentOn,
                note: snapshot.note,
                splitMode: snapshot.splitMode,
                split: itemsFromExpense(snapshot),
              },
            }),
        },
        duration: 7000,
      });
    } catch (err) {
      toast.error("Не удалось удалить", { description: err instanceof Error ? err.message : "Попробуй ещё раз" });
    }
  };

  // Кто уже вернул свою долю: только переводы, привязанные именно к этой трате
  const settlement = e
    ? expenseSettlement(e, model.payments.filter((p) => p.expenseId === e.id))
    : [];
  const linkedCount = e ? model.payments.filter((p) => p.expenseId === e.id).length : 0;

  // Нетто-долг пары «дольщик → плательщик» (из model.debts): минус или ноль — долг доли уже
  // перекрыт встречными тратами, отметка перевода его не закрывает, а откатывает баланс назад
  const shareDirNet = (sharerId: string, payerId: string): number => {
    const d = model.debts.find(
      (x) => (x.fromId === sharerId && x.toId === payerId) || (x.fromId === payerId && x.toId === sharerId),
    );
    if (!d) return 0;
    return d.fromId === sharerId ? d.cents : -d.cents;
  };

  const cat = e ? SPLIT_CATEGORIES[categoryOf(e.category)] : null;
  const stake = e ? myStake(e, group.myMemberId) : null;
  const payer = e ? model.membersById.get(e.paidById) : null;
  const author = e ? model.membersById.get(e.createdById) : null;

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setConfirming(false);
          onClose();
        }
      }}
      title={e?.description ?? ""}
    >
      {e && cat && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl grid place-items-center text-2xl shrink-0" style={{ background: `${cat.color}22` }} aria-hidden>
              {cat.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-2xl font-bold tabular-nums">{formatCents(e.amountCents, group.currency)}</div>
              {e.originalCurrency && e.originalAmountCents ? (
                <div className="text-xs text-muted-foreground tabular-nums">
                  {formatCents(e.originalAmountCents, e.originalCurrency)} · курс {formatRate(e.amountCents / e.originalAmountCents)}
                </div>
              ) : null}
              <div className="text-xs text-muted-foreground">
                {cat.label} · {dayLabel(e.spentOn, localDateKey())}
                {e.recurringId && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 text-primary">
                    <Repeat className="size-3" /> повтор
                  </span>
                )}
              </div>
            </div>
          </div>

          {stake && stake.kind !== "none" && (
            <div className={cn("rounded-xl px-3 py-2 text-sm font-medium", stake.kind === "lent" ? "bg-emerald-500/10" : stake.kind === "borrowed" ? "bg-rose-500/10" : "bg-muted")}>
              <span className={cn(stake.kind === "lent" && balanceTone(1), stake.kind === "borrowed" && balanceTone(-1))}>
                {stake.kind === "lent" && `Тебе должны ${formatCents(stake.cents, group.currency)}`}
                {stake.kind === "borrowed" && `Ты должен(на) ${formatCents(stake.cents, group.currency)}`}
                {stake.kind === "self" && "Ты заплатил(а) за себя — долгов нет"}
              </span>
            </div>
          )}

          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Заплатил(а)</dt>
              <dd className="font-medium flex items-center gap-1.5">
                {payer && <MemberAvatar member={payer} className="size-5" />}
                {payer?.id === group.myMemberId ? "Я" : (payer?.name ?? "Бывший участник")}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Деление</dt>
              <dd className="font-medium">{MODE_LABEL[e.splitMode]}</dd>
            </div>
            {author && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Внёс(ла)</dt>
                <dd className="font-medium">{author.id === group.myMemberId ? "я" : author.name}</dd>
              </div>
            )}
          </dl>

          <div>
            <div className="text-xs text-muted-foreground mb-1">Кто сколько</div>
            <ul className="rounded-xl border border-border divide-y divide-border">
              {e.shares.map((s) => {
                const m = model.membersById.get(s.memberId);
                const st = settlement.find((x) => x.memberId === s.memberId);
                const iAmDebtor = s.memberId === group.myMemberId;
                const iAmPayer = e.paidById === group.myMemberId;
                const canMark = !!st && st.remainingCents > 0 && (iAmDebtor || iAmPayer);
                // Нетто пары против направления доли — «уже учтено»: кнопка переименовывается и предупреждает
                const nettedAway = canMark ? shareDirNet(s.memberId, e.paidById) <= 0 : false;
                return (
                  <li key={s.memberId} className="px-3 py-2 text-sm">
                    <div className="flex items-center gap-2.5 min-h-8">
                      {m && <MemberAvatar member={m} className="size-6" />}
                      <span className="flex-1 truncate">
                        {s.memberId === group.myMemberId ? "Я" : (m?.name ?? "Бывший участник")}
                        {e.splitMode === "shares" && s.weight ? <span className="ml-1.5 text-xs text-muted-foreground">{s.weight} дол.</span> : null}
                        {e.splitMode === "percent" && s.weight ? <span className="ml-1.5 text-xs text-muted-foreground">{s.weight / 100}%</span> : null}
                      </span>
                      <Money cents={s.cents} currency={group.currency} className="font-medium" />
                    </div>
                    {/* Доля того, кто платил не он: оплачена ли, сколько осталось, кнопка отметки перевода */}
                    {st && (
                      <div className="mt-1 flex items-center gap-2 pl-8.5 text-xs">
                        {st.remainingCents === 0 ? (
                          <span className={cn("inline-flex items-center gap-1 font-medium", balanceTone(1))}>
                            <Check className="size-3.5" aria-hidden /> оплачено
                          </span>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">
                            {st.paidCents > 0 ? `оплачено ${formatCents(st.paidCents, group.currency)}, ` : ""}осталось{" "}
                            <b className="text-foreground">{formatCents(st.remainingCents, group.currency)}</b>
                          </span>
                        )}
                        {canMark && (
                          <button
                            type="button"
                            onClick={() => {
                              const target: SettleTarget = {
                                fromId: s.memberId,
                                toId: e.paidById,
                                cents: st.remainingCents,
                                expenseId: e.id,
                                forLabel: e.description,
                              };
                              if (nettedAway) {
                                setPendingSettle({
                                  target,
                                  warn: nettedShareMark({
                                    payerIsViewer: iAmPayer,
                                    sharerIsViewer: iAmDebtor,
                                    shareCents: st.remainingCents,
                                    netCents: shareDirNet(s.memberId, e.paidById),
                                    currency: group.currency,
                                  }),
                                });
                              } else {
                                onSettle(target);
                              }
                            }}
                            className="ml-auto inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg bg-primary text-primary-foreground font-semibold active:scale-95 transition-transform"
                          >
                            <HandCoins className="size-3.5" aria-hidden />
                            {nettedAway ? (iAmDebtor ? "Перевёл(а) отдельно" : "Получил(а) отдельно") : iAmDebtor ? "Перевёл(а)" : "Получил(а)"}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {e.note && (
            <p className="text-sm bg-muted/60 rounded-xl px-3 py-2 whitespace-pre-wrap break-words">{e.note}</p>
          )}

          <div className="flex gap-2 pt-1">
            <SecondaryButton className="flex-1" onClick={() => onEdit(e)}>
              <Pencil className="size-4" /> Изменить
            </SecondaryButton>
            {confirming ? (
              <button
                type="button"
                onClick={remove}
                disabled={del.isPending}
                className="flex-1 min-h-11 rounded-xl bg-destructive text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
              >
                {del.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Точно удалить
              </button>
            ) : (
              <SecondaryButton className="flex-1 text-destructive" onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" /> Удалить
              </SecondaryButton>
            )}
          </div>
          {confirming && linkedCount > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 text-center">
              К этой трате привязано переводов: {linkedCount}. Они останутся в расчётах (деньги уже отданы), но перестанут относиться к трате.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground text-center">Любой участник может править траты — все изменения видны в журнале группы.</p>
        </div>
      )}
      {pendingSettle && (
        <AlertDialog open onOpenChange={(v) => { if (!v) setPendingSettle(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pendingSettle.warn.title}</AlertDialogTitle>
              <AlertDialogDescription>{pendingSettle.warn.body}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onSettle(pendingSettle.target);
                  setPendingSettle(null);
                }}
              >
                {pendingSettle.warn.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </MobileBottomSheet>
  );
}
