"use client";

import { useState } from "react";
import { ArrowRight, Copy, CreditCard, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { dayLabel, localDateKey } from "@/lib/split/dates";
import { formatCents } from "@/lib/split/money";
import type { Debt } from "@/lib/split/balances";
import { isTmpId, useDeletePayment, useSavePayment } from "@/hooks/split/use-split";
import type { GroupModel } from "@/hooks/split/use-group-model";
import { EmptyState, MemberAvatar, Money, PrimaryButton, SecondaryButton, balanceTone } from "./ui";
import type { SettleTarget } from "./settle-sheet";

function Name({ model, id }: { model: GroupModel; id: string }) {
  const m = model.membersById.get(id);
  const isMe = id === model.group?.myMemberId;
  return (
    <span className="truncate">
      {isMe ? "Ты" : (m?.name ?? "Бывший участник")}
      {m && m.status !== "active" && <span className="ml-1 text-[10px] font-normal text-muted-foreground">вышел</span>}
    </span>
  );
}

function DebtRow({ debt, model, onSettle }: { debt: Debt; model: GroupModel; onSettle: (t: SettleTarget) => void }) {
  const group = model.group!;
  const me = group.myMemberId;
  const from = model.membersById.get(debt.fromId);
  const to = model.membersById.get(debt.toId);
  const iOwe = debt.fromId === me;
  const owedToMe = debt.toId === me;
  // Реквизиты показываем тому, кто должен перевести: иначе номер карты улетает в общий чат
  const requisites = iOwe ? to?.paymentDetails : null;

  const copy = () => {
    void navigator.clipboard?.writeText(requisites ?? "").then(
      () => toast.success("Реквизиты скопированы"),
      () => toast.error("Не удалось скопировать")
    );
  };

  return (
    <li className={cn("rounded-xl px-3 py-2.5 bg-muted/40", (iOwe || owedToMe) && "ring-1 ring-primary/25")}>
      <div className="flex items-center gap-2">
        {from && <MemberAvatar member={from} className="size-8" />}
        <div className="min-w-0 flex-1 text-sm leading-tight">
          <div className="flex items-center gap-1.5 font-medium min-w-0">
            <Name model={model} id={debt.fromId} />
            <ArrowRight className="size-3.5 text-muted-foreground shrink-0" aria-label="должен" />
            <Name model={model} id={debt.toId} />
          </div>
          <div className="text-[11px] text-muted-foreground">{iOwe ? "ты должен(на)" : owedToMe ? "тебе должны" : "должен(на)"}</div>
        </div>
        <Money cents={debt.cents} currency={group.currency} className={cn("text-base font-bold", iOwe ? balanceTone(-1) : owedToMe ? balanceTone(1) : "")} />
      </div>
      {requisites && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <CreditCard className="size-3.5 shrink-0" />
          <span className="truncate flex-1" title={requisites}>
            {requisites}
          </span>
          <button type="button" onClick={copy} className="shrink-0 inline-flex items-center gap-1 min-h-9 px-2.5 rounded-lg border border-border hover:bg-muted active:scale-95 transition-transform">
            <Copy className="size-3" /> Копировать
          </button>
        </div>
      )}
      {(iOwe || owedToMe) && (
        <div className="mt-2 flex justify-end">
          <PrimaryButton className="min-h-10 text-xs px-3" onClick={() => onSettle({ fromId: debt.fromId, toId: debt.toId, cents: debt.cents })}>
            {iOwe ? "Я отдал(а)" : "Мне отдали"}
          </PrimaryButton>
        </div>
      )}
    </li>
  );
}

export function BalanceTab({ model, onSettle }: { model: GroupModel; onSettle: (t: SettleTarget | null) => void }) {
  const group = model.group!;
  const me = group.myMemberId;
  const del = useDeletePayment(group.id);
  const redo = useSavePayment(group.id, me);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const today = localDateKey();

  const mine = model.debts.filter((d) => d.fromId === me || d.toId === me);
  const others = model.debts.filter((d) => d.fromId !== me && d.toId !== me);
  const balanceRows = [...model.membersById.values()]
    .filter((m) => m.status === "active" || (model.balances.get(m.id) ?? 0) !== 0)
    .sort((a, b) => (model.balances.get(b.id) ?? 0) - (model.balances.get(a.id) ?? 0));
  const payments = showAllPayments ? model.payments : model.payments.slice(0, 5);

  const removePayment = (id: string) => {
    const p = model.payments.find((x) => x.id === id);
    del.mutate(id, {
      onSuccess: () =>
        p &&
        toast("Перевод отменён", {
          action: {
            label: "Вернуть",
            onClick: () =>
              redo.mutate({ fromId: p.fromId, toId: p.toId, amountCents: p.amountCents, paidOn: p.paidOn, note: p.note, clientKey: `redo-${p.id}-${Date.now()}` }),
          },
        }),
      onError: (e) => toast.error("Не удалось отменить", { description: e instanceof Error ? e.message : undefined }),
    });
  };

  return (
    <div className="space-y-4">
      {/* Моя позиция */}
      {model.myOwe === 0 && model.myOwed === 0 ? (
        <div className="rounded-2xl bg-card border border-border">
          <EmptyState
            emoji={model.debts.length === 0 ? "🎉" : "👌"}
            title={model.debts.length === 0 ? "Все в расчёте" : "У тебя нет долгов"}
            text={model.debts.length === 0 ? "Никто никому не должен." : "Между другими участниками расчёты ниже."}
          />
        </div>
      ) : (
        <div className={cn("grid gap-2", model.myOwe > 0 && model.myOwed > 0 ? "grid-cols-2" : "grid-cols-1")}>
          {model.myOwe > 0 && (
            <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 px-3 py-3">
              <div className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Ты должен(на)</div>
              <Money cents={model.myOwe} currency={group.currency} className="text-xl font-bold text-rose-600 dark:text-rose-400" />
            </div>
          )}
          {model.myOwed > 0 && (
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-3">
              <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Тебе должны</div>
              <Money cents={model.myOwed} currency={group.currency} className="text-xl font-bold text-emerald-700 dark:text-emerald-400" />
            </div>
          )}
        </div>
      )}

      {/* Кто кому */}
      {model.debts.length > 0 && (
        <section className="rounded-2xl bg-card border border-border p-3 space-y-2">
          <h2 className="font-semibold text-sm px-1">Кому сколько перевести</h2>
          <ul className="space-y-2">
            {mine.map((d) => (
              <DebtRow key={`${d.fromId}-${d.toId}`} debt={d} model={model} onSettle={onSettle} />
            ))}
          </ul>
          {others.length > 0 && (
            <>
              <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground px-1 pt-1">Между другими</h3>
              <ul className="space-y-2">
                {others.map((d) => (
                  <DebtRow key={`${d.fromId}-${d.toId}`} debt={d} model={model} onSettle={onSettle} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <SecondaryButton className="w-full" onClick={() => onSettle(null)}>
        Записать перевод вручную
      </SecondaryButton>

      {/* Итоговые балансы */}
      <section className="rounded-2xl bg-card border border-border p-3">
        <h2 className="font-semibold text-sm px-1 mb-1">Балансы</h2>
        <ul className="divide-y divide-border">
          {balanceRows.map((m) => {
            const b = model.balances.get(m.id) ?? 0;
            return (
              <li key={m.id} className="flex items-center gap-2.5 py-2 px-1 text-sm">
                <MemberAvatar member={m} className="size-8" />
                <span className="flex-1 min-w-0 truncate font-medium">
                  {m.id === me ? `${m.name} (я)` : m.name}
                  {m.status !== "active" && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">вышел</span>}
                </span>
                <span className={cn("font-semibold tabular-nums", balanceTone(b))}>{b === 0 ? "ровно" : formatCents(b, group.currency, { sign: true })}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-muted-foreground px-1 pt-2">«+» — человеку должны, «−» — он должен. Учтены все траты и переводы.</p>
      </section>

      {/* История переводов */}
      {model.payments.length > 0 && (
        <section className="rounded-2xl bg-card border border-border p-3">
          <h2 className="font-semibold text-sm px-1 mb-1">Переводы</h2>
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className={cn("flex items-center gap-2 py-2 px-1 text-sm", isTmpId(p.id) && "opacity-60")}>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 font-medium truncate">
                    <Name model={model} id={p.fromId} />
                    <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                    <Name model={model} id={p.toId} />
                  </span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {dayLabel(p.paidOn, today)}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                </span>
                <Money cents={p.amountCents} currency={group.currency} className="font-semibold" />
                <button
                  type="button"
                  onClick={() => removePayment(p.id)}
                  disabled={isTmpId(p.id) || del.isPending}
                  aria-label="Отменить перевод"
                  title="Отменить перевод"
                  className="size-10 rounded-lg grid place-items-center text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          {model.payments.length > 5 && (
            <button type="button" onClick={() => setShowAllPayments((v) => !v)} className="w-full min-h-10 text-xs font-medium text-primary inline-flex items-center justify-center gap-1">
              {showAllPayments ? "Свернуть" : `Показать все ${model.payments.length}`}
              <Undo2 className={cn("size-3 transition-transform", showAllPayments ? "rotate-90" : "-rotate-90")} aria-hidden />
            </button>
          )}
        </section>
      )}
    </div>
  );
}
