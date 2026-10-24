"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Copy, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/currencies";
import { pairNet } from "@/lib/split/balances";
import { localDateKey } from "@/lib/split/dates";
import { centsToInput, formatCents, parseAmountToCents } from "@/lib/split/money";
import { useSavePayment } from "@/hooks/split/use-split";
import type { GroupModel } from "@/hooks/split/use-group-model";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { StickySubmit } from "@/components/trip/quick-add/StickySubmit";
import { MemberAvatar, Segmented, inputClass } from "./ui";

export interface SettleTarget {
  /** Должник */
  fromId: string;
  /** Кому должен */
  toId: string;
  cents: number;
  /** Перевод «за конкретную трату»: помечает долю в ней оплаченной */
  expenseId?: string;
  /** Название этой траты — в подписи и заметке перевода */
  forLabel?: string;
}

/** Быстрые пометки «как рассчитались» — в заметку перевода */
const HOW_NOTES = ["Картой", "Наличными", "Оплатил(а) за тебя"] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  model: GroupModel;
  /** Из строки долга — всё заполнено; без него человека и сумму выбирают в форме */
  target: SettleTarget | null;
}

export function SettleSheet({ open, onOpenChange, model, target }: Props) {
  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Записать перевод">
      <SettleBody model={model} target={target} onDone={() => onOpenChange(false)} />
    </MobileBottomSheet>
  );
}

function SettleBody({ model, target, onDone }: { model: GroupModel; target: SettleTarget | null; onDone: () => void }) {
  const group = model.group!;
  const me = group.myMemberId;
  const save = useSavePayment(group.id, me);
  const today = useMemo(() => localDateKey(), []);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localDateKey(d);
  }, []);

  // Если звали из долга: я либо должник (отдаю), либо кредитор (мне отдали)
  const initialDirection: "gave" | "got" = target && target.toId === me ? "got" : "gave";
  const initialOther = target ? (target.fromId === me ? target.toId : target.fromId) : "";
  const [direction, setDirection] = useState<"gave" | "got">(initialDirection);
  const [otherId, setOtherId] = useState(initialOther);
  const [amountStr, setAmountStr] = useState(target ? centsToInput(target.cents) : "");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState(target?.forLabel ? `За «${target.forLabel}»` : "");

  const others = model.activeMembers.filter((m) => m.id !== me);
  // Закрыть долг перед вышедшим тоже нужно: добавляем его в выбор, если он в расчёте
  const former = [...model.membersById.values()].filter((m) => m.status !== "active" && m.id !== me && (model.balances.get(m.id) ?? 0) !== 0);
  const choices = [...others, ...former];

  const amountCents = parseAmountToCents(amountStr) ?? 0;
  const fromId = direction === "gave" ? me : otherId;
  const toId = direction === "gave" ? otherId : me;
  // Текущий долг пары в сторону этого перевода
  const owed = otherId ? Math.max(0, pairNet(model.expenses, model.payments, fromId, toId)) : 0;
  const overpay = amountCents > 0 && otherId !== "" && amountCents > owed;
  const other = model.membersById.get(otherId);
  const canSubmit = amountCents > 0 && !!otherId && !save.isPending;

  const submit = async () => {
    if (!canSubmit) {
      if (!otherId) toast.error("Выбери, с кем рассчитываешься");
      else toast.error("Введи сумму");
      return;
    }
    try {
      await save.mutateAsync({
        fromId,
        toId,
        amountCents,
        paidOn,
        note: note.trim() || null,
        expenseId: target?.expenseId ?? null,
        // Ключ идемпотентности: двойной тап и ретрай сети не создают второй перевод
        clientKey: `pay-${me}-${fromId}-${toId}-${amountCents}-${Date.now()}`,
      });
      toast.success("Перевод записан ✅", {
        description: `${direction === "gave" ? "Ты отдал(а)" : "Тебе отдал(а)"} ${formatCents(amountCents, group.currency)}${other ? ` · ${other.name}` : ""}`,
      });
      onDone();
    } catch (err) {
      toast.error("Не удалось записать перевод", { description: err instanceof Error ? err.message : "Попробуй ещё раз" });
    }
  };

  return (
    <div className="space-y-4 pt-1">
      {!target && (
        <Segmented
          value={direction}
          onChange={setDirection}
          options={[
            { value: "gave", label: "Я отдал(а)" },
            { value: "got", label: "Мне отдали" },
          ]}
        />
      )}

      {target ? (
        <div className="rounded-2xl bg-muted/50 py-3">
          <div className="flex items-center justify-center gap-3">
            <Person model={model} id={fromId} />
            <ArrowRight className="size-4 text-muted-foreground" />
            <Person model={model} id={toId} />
          </div>
          {target.forLabel && <p className="mt-2 text-center text-xs text-muted-foreground px-3 truncate">за «{target.forLabel}»</p>}
        </div>
      ) : (
        <div>
          <div className="text-xs text-muted-foreground mb-1">{direction === "gave" ? "Кому" : "От кого"}</div>
          {choices.length === 0 ? (
            <p className="text-sm text-muted-foreground">В группе пока никого, с кем можно рассчитаться.</p>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {choices.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={otherId === m.id}
                  onClick={() => setOtherId(m.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 pl-1.5 pr-3 min-h-10 rounded-full text-sm font-medium transition-colors active:scale-95",
                    otherId === m.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-background border border-input hover:bg-accent"
                  )}
                >
                  <MemberAvatar member={m} className="size-7" />
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Мне нужно отдать: показываем, куда — без похода в чат за номером карты */}
      {direction === "gave" && other?.paymentDetails && (
        <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs">
          <CreditCard className="size-4 text-muted-foreground shrink-0" />
          <span className="flex-1 min-w-0 whitespace-pre-wrap break-words">{other.paymentDetails}</span>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard?.writeText(other.paymentDetails ?? "").then(
                () => toast.success("Реквизиты скопированы"),
                () => toast.error("Не удалось скопировать")
              )
            }
            className="shrink-0 inline-flex items-center gap-1 min-h-9 px-2.5 rounded-lg border border-border hover:bg-muted active:scale-95 transition-transform"
          >
            <Copy className="size-3" /> Копировать
          </button>
        </div>
      )}

      <div>
        <label htmlFor="settle-amount" className="text-xs text-muted-foreground mb-1 block">
          Сумма
        </label>
        <div className="flex items-baseline gap-2">
          <input
            id="settle-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0"
            className="w-full bg-transparent border-0 border-b-2 border-input rounded-none px-0 py-1 text-4xl font-bold tabular-nums input-mobile focus:outline-none focus:border-primary transition-colors"
          />
          <span className="text-2xl font-semibold text-muted-foreground">{currencySymbol(group.currency).trim()}</span>
        </div>
        {otherId && owed > 0 && (
          <button
            type="button"
            onClick={() => setAmountStr(centsToInput(owed))}
            className="mt-1.5 text-xs text-primary font-medium min-h-9"
          >
            Весь долг: {formatCents(owed, group.currency)}
          </button>
        )}
        {overpay && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400" role="status">
            {owed > 0
              ? `Это больше долга на ${formatCents(amountCents - owed, group.currency)} — разница станет долгом в другую сторону.`
              : "Сейчас долга нет — запись создаст встречный долг."}
          </p>
        )}
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-1">Когда</div>
        <div className="flex gap-1.5 items-center flex-wrap">
          {[
            { key: today, label: "Сегодня" },
            { key: yesterday, label: "Вчера" },
          ].map((d) => (
            <button
              key={d.key}
              type="button"
              aria-pressed={paidOn === d.key}
              onClick={() => setPaidOn(d.key)}
              className={cn("min-h-10 px-4 rounded-full text-sm font-medium border transition-colors active:scale-95", paidOn === d.key ? "bg-primary/10 border-primary/40" : "border-border text-muted-foreground")}
            >
              {d.label}
            </button>
          ))}
          <input type="date" value={paidOn} max={today} onChange={(e) => e.target.value && setPaidOn(e.target.value)} className="rounded-xl border border-input bg-background px-3 py-2 text-sm input-mobile min-h-10" aria-label="Другая дата" />
        </div>
      </div>

      <div className="space-y-1.5">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка (необязательно): как перевели" maxLength={500} className={cn(inputClass, "text-sm")} />
        {/* Рассчитываются не только картой: вместо денег часто оплачивают что-то за человека */}
        <div className="flex gap-1.5 flex-wrap">
          {HOW_NOTES.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={note === h}
              onClick={() => setNote((cur) => (cur === h ? "" : h))}
              className={cn("min-h-9 px-3 rounded-full text-xs font-medium border transition-colors active:scale-95", note === h ? "bg-primary/10 border-primary/40" : "border-border text-muted-foreground")}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      <StickySubmit>
        <button
          type="button"
          onClick={submit}
          disabled={save.isPending}
          aria-disabled={!canSubmit}
          className={cn(
            "w-full rounded-xl py-3.5 min-h-[48px] text-base font-semibold flex items-center justify-center gap-2 transition-[transform,opacity] active:scale-[0.98]",
            canSubmit ? "bg-primary text-primary-foreground" : "bg-primary/40 text-primary-foreground/80"
          )}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Записать{amountCents > 0 ? ` · ${formatCents(amountCents, group.currency)}` : ""}
        </button>
      </StickySubmit>
    </div>
  );
}

function Person({ model, id }: { model: GroupModel; id: string }) {
  const m = model.membersById.get(id);
  const isMe = id === model.group?.myMemberId;
  return (
    <div className="flex flex-col items-center gap-1 min-w-16">
      {m && <MemberAvatar member={m} className="size-10" />}
      <span className="text-xs font-medium truncate max-w-24">{isMe ? "Я" : (m?.name ?? "Бывший участник")}</span>
    </div>
  );
}
