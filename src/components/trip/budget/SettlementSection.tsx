"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Scale, Info, ChevronDown, Copy, CreditCard, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Balance, Settlement } from "@/lib/budget";
import { moneyDelta, moneyExact } from "@/lib/budget/format";
import { MarkSettledButton } from "./MarkSettledButton";
import { UserAvatar } from "../user-avatar";

interface SettlementSectionProps {
  balances: Balance[];
  settlements: Settlement[];
  participantsCount: number;
  currencySymbol?: string;
  /** Текущий пользователь: его переводы идут первыми и подсвечены */
  currentUserId?: string;
}

const REVEAL = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
};

// Пометка у вышедшего/исключённого участника: его долги остаются в расчёте (lib/budget/people.ts)
function FormerTag({ former }: { former?: boolean }) {
  return former ? <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">вышел</span> : null;
}

/**
 * «Расчёт между друзьями». Главное здесь — действие: кто кому сколько переводит.
 * Поэтому сначала переводы (свои сверху), а балансы — справка, свёрнутая под ними.
 * Итог «сколько должен я» живёт в шапке страницы и здесь не дублируется.
 */
export function SettlementSection({ balances, settlements, participantsCount, currencySymbol: sym = "$", currentUserId = "" }: SettlementSectionProps) {
  const [showHint, setShowHint] = useState(false);
  const [showBalances, setShowBalances] = useState(false);

  const involvesMe = (s: Settlement) => s.from.id === currentUserId || s.to.id === currentUserId;
  const orderedSettlements = [...settlements].sort((a, b) => Number(involvesMe(b)) - Number(involvesMe(a)));

  return (
    <section id="budget-settlement" aria-labelledby="budget-settlement-title" className="scroll-mt-32 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Scale className="size-4 shrink-0" aria-hidden="true" />
        <h2 id="budget-settlement-title" className="text-sm font-semibold">Расчёт между друзьями</h2>
        <button
          type="button"
          onClick={() => setShowHint((v) => !v)}
          aria-expanded={showHint}
          aria-label="Как считаются долги"
          title="Как считаются долги"
          className="-my-2 -mr-2 ml-auto grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <Info className="size-4" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showHint && (
          <motion.div {...REVEAL} className="overflow-hidden">
            <ul className="mt-3 space-y-1.5 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              <li><b className="text-foreground">Личная трата</b> идёт только в статистику и долгов не создаёт.</li>
              <li><b className="text-foreground">Заплатил за других</b>: те, за кого заплатили, должны свою долю.</li>
              <li>Для каждой пары показан чистый долг: сколько A должен B минус сколько B должен A.</li>
              <li>Кнопка <b className="text-foreground">«Перевели»</b> есть у того, кому должны. Нажмите, когда деньги пришли.</li>
              {participantsCount > 2 && (
                <li>Втроём и больше число переводов иногда можно сократить, но суммы здесь всегда честные.</li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {settlements.length > 0 ? (
        // Ключ строки — пара участников, не индекс: после перевода список пересчитывается и меняет
        // порядок/длину (при key={i} React переиспользовал done-состояние кнопки у чужой пары).
        // Погашенная пара сворачивается и исчезает (оптимистично — до ответа сервера)
        <div className="mt-3">
          <AnimatePresence initial={false}>
            {orderedSettlements.map((s) => (
              <motion.div
                key={`${s.from.id}-${s.to.id}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="pb-2">
                  <TransferRow settlement={s} sym={sym} currentUserId={currentUserId} mine={involvesMe(s)} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> Долгов нет
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowBalances((v) => !v)}
        aria-expanded={showBalances}
        className="-mb-2 mt-1 flex min-h-11 w-full items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Кто сколько внёс
        <ChevronDown className={cn("size-3.5 transition-transform", showBalances && "rotate-180")} aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {showBalances && (
          <motion.div {...REVEAL} className="overflow-hidden">
            <ul className="mt-2 divide-y divide-border">
              {balances.map((b) => (
                <BalanceRow key={b.participant.id} balance={b} sym={sym} isMe={b.participant.id === currentUserId} />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function TransferRow({
  settlement: s,
  sym,
  currentUserId,
  mine,
}: {
  settlement: Settlement;
  sym: string;
  currentUserId: string;
  mine: boolean;
}) {
  const iPay = s.from.id === currentUserId;
  const iGet = s.to.id === currentUserId;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-muted/40 p-3", mine && "ring-1 ring-inset ring-primary/30")}>
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
        <div className="flex shrink-0 -space-x-2">
          <UserAvatar name={s.from.name} emoji={s.from.emoji} color={s.from.color} avatarUrl={s.from.avatarUrl} className="size-8 ring-2 ring-card" textClassName="text-xs" />
          <UserAvatar name={s.to.name} emoji={s.to.emoji} color={s.to.color} avatarUrl={s.to.avatarUrl} className="size-8 ring-2 ring-card" textClassName="text-xs" />
        </div>
        <div className="min-w-0 flex-1">
          {/* Две строки, а не одна: длинное имя отправителя не должно съедать получателя */}
          <div className="truncate text-sm font-medium">{iPay ? "Ты" : s.from.name}<FormerTag former={s.from.former} /></div>
          <div className="truncate text-sm font-medium">
            <span className="mr-1 text-muted-foreground" aria-label="переводит">→</span>
            {iGet ? "тебе" : s.to.name}
            <FormerTag former={s.to.former} />
          </div>
        </div>
        <span className="shrink-0 text-base font-bold tabular-nums">{moneyExact(sym, s.amount)}</span>
      </div>

      {/* На телефоне действия ниже, на широком экране — в той же строке */}
      <div className="flex w-full min-w-0 items-center justify-end gap-2 empty:hidden lg:w-auto">
        {/* Куда переводить: реквизиты получателя, если он их заполнил
            (иначе номер карты летит в общий чат — кейс реальной поездки) */}
        {s.to.paymentDetails && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
            <CreditCard className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate" title={s.to.paymentDetails}>{s.to.paymentDetails}</span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(s.to.paymentDetails ?? "").then(
                  () => toast.success("Реквизиты скопированы"),
                  () => toast.error("Не удалось скопировать")
                );
              }}
              aria-label="Копировать реквизиты"
              title="Копировать реквизиты"
              className="grid size-11 shrink-0 place-items-center rounded-lg transition-colors hover:bg-muted hover:text-foreground"
            >
              <Copy className="size-4" />
            </button>
          </div>
        )}
        {/* key по сумме: «Получено» не залипает, если у пары остался новый долг */}
        <MarkSettledButton key={Math.round(s.amount * 100)} from={s.from} to={s.to} amount={s.amount} />
      </div>
    </div>
  );
}

function BalanceRow({ balance: b, sym, isMe }: { balance: Balance; sym: string; isMe: boolean }) {
  const [open, setOpen] = useState(false);
  const tone = b.balance > 0 ? "text-green-700 dark:text-green-400" : b.balance < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2.5 py-1.5 text-left"
      >
        <UserAvatar
          name={b.participant.name}
          emoji={b.participant.emoji}
          color={b.participant.color}
          avatarUrl={b.participant.avatarUrl}
          className="size-8"
          textClassName="text-xs"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {b.participant.name}
            {isMe && <span className="ml-1.5 text-[11px] font-medium text-primary">ты</span>}
            <FormerTag former={b.participant.former} />
          </span>
          <span className="block text-xs text-muted-foreground tabular-nums">внёс {moneyExact(sym, b.paid)}</span>
        </span>
        <span className={cn("shrink-0 text-sm font-semibold tabular-nums", tone)}>
          {b.balance === 0 ? "ровно" : moneyDelta(sym, b.balance)}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div {...REVEAL} className="overflow-hidden">
            <dl className="mb-2 space-y-1 rounded-xl bg-muted/40 p-3 text-xs">
              <BalanceFact label="Заплачено всего" value={moneyExact(sym, b.paid)} />
              <BalanceFact label="К получению" value={moneyExact(sym, b.owedToMe)} />
              <BalanceFact label="К возврату" value={moneyExact(sym, b.owedToOthers)} />
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function BalanceFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
