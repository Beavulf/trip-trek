"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Scale, Info, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Balance, Settlement } from "@/lib/budget";
import { MarkSettledButton } from "./MarkSettledButton";

interface SettlementSectionProps {
  balances: Balance[];
  settlements: Settlement[];
  totalSpent: number;
  participantsCount: number;
}

// "Расчёт между друзьями" — балансы, расшифровка, список переводов
export function SettlementSection({ balances, settlements, totalSpent, participantsCount }: SettlementSectionProps) {
  const [showBalanceHint, setShowBalanceHint] = useState(false);
  const [showSettlementHint, setShowSettlementHint] = useState(false);
  const [expandedBalance, setExpandedBalance] = useState<string | null>(null);

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <Scale className="size-4" />
        <h2 className="font-semibold text-sm">Расчёт между друзьями</h2>
        <button
          onClick={() => setShowBalanceHint(v => !v)}
          className="ml-auto size-11 rounded-full bg-muted grid place-items-center text-muted-foreground shrink-0 active:scale-90 transition-transform"
          title="Как это работает?"
        >
          <Info className="size-3.5" />
        </button>
      </div>

      {/* Разворачивающаяся подсказка (тап по ℹ️) */}
      <AnimatePresence>
        {showBalanceHint && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-muted/50 rounded-xl p-3 mb-3 space-y-1.5 text-[11px] text-muted-foreground">
              <div className="flex items-start gap-1.5">
                <span className="text-primary shrink-0">①</span>
                <span><b className="text-foreground">Личная трата</b> (только за себя) — просто учитывается в статистике, долги не создаёт.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-primary shrink-0">②</span>
                <span><b className="text-foreground">Заплатил за других</b> — те, за кого заплатил, должны тебе деньги.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-primary shrink-0">③</span>
                <span><b className="text-foreground">Внёс</b> — сколько всего человек заплатил из кошелька.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-primary shrink-0">④</span>
                <span><b className="text-green-600">+</b> зелёная — человеку должны. <b className="text-red-500">−</b> красная — человек должен.</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-primary shrink-0">⑤</span>
                <span>Кнопка <b className="text-foreground">«Перевели»</b> — у того, кому должны. Нажми когда получил перевод.</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Балансы участников */}
      <div className="space-y-2 mb-3">
        {balances.map((b) => {
          return (
            <div key={b.participant.id} className="flex items-center gap-2.5 text-sm">
              <div className="size-8 rounded-full grid place-items-center text-xs shrink-0" style={{ background: b.participant.color }}>
                {b.participant.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{b.participant.name}</div>
                <button
                  onClick={() => setExpandedBalance(expandedBalance === b.participant.id ? null : b.participant.id)}
                  className="text-[10px] text-muted-foreground flex items-center gap-1 active:scale-95 transition-transform"
                >
                  внёс ${b.paid.toFixed(2)}
                  <ChevronDown className={cn("size-2.5 transition-transform", expandedBalance === b.participant.id && "rotate-180")} />
                </button>
              </div>
              <span className={cn("font-semibold text-right text-sm shrink-0 tabular-nums", b.balance > 0 ? "text-green-600" : b.balance < 0 ? "text-red-500" : "text-muted-foreground")}>
                {b.balance > 0 ? `+$${b.balance.toFixed(2)}` : b.balance < 0 ? `−$${Math.abs(b.balance).toFixed(2)}` : "ровно"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Расшифровка для выбранного участника */}
      <AnimatePresence>
        {expandedBalance && (() => {
          const b = balances.find(x => x.participant.id === expandedBalance);
          if (!b) return null;
          const share = totalSpent / participantsCount;
          return (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-muted/40 rounded-xl p-3 mb-3 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{b.participant.name} заплатил всего</span>
                  <span className="font-medium">${b.paid.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Ему должны</span>
                  <span className="font-medium text-green-600">${b.owedToMe.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Он должен</span>
                  <span className="font-medium text-red-500">${b.owedToOthers.toFixed(2)}</span>
                </div>
                <div className="border-t border-border pt-1.5 flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {b.balance > 0 ? "Итог: ему должны" : b.balance < 0 ? "Итог: он должен" : "Итог: всё поровну"}
                  </span>
                  <span className={cn("font-bold", b.balance > 0 ? "text-green-600" : b.balance < 0 ? "text-red-500" : "text-muted-foreground")}>
                    {b.balance > 0 ? `+$${b.balance.toFixed(2)}` : b.balance < 0 ? `−$${Math.abs(b.balance).toFixed(2)}` : "$0"}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Кто кому переводит */}
      {settlements.length > 0 ? (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground font-medium">Кому сколько перевести:</span>
            <button
              onClick={() => setShowSettlementHint(v => !v)}
              className="size-5 rounded-full bg-muted grid place-items-center text-muted-foreground shrink-0 active:scale-90 transition-transform"
            >
              <Info className="size-3" />
            </button>
          </div>
          <AnimatePresence>
            {showSettlementHint && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-muted/50 rounded-lg p-2.5 mb-2 text-[11px] text-muted-foreground">
                  💡 Это <b className="text-foreground">попарные переводы</b> («кто кому сколько должен»).
                  Для каждой пары участников показан чистый долг A→B минус B→A. Нажми «Перевели» когда получил перевод — у пары баланс обнулится.
                  {participantsCount > 2 && (
                    <span className="block mt-1 text-amber-500">
                      При 3+ участниках иногда можно уменьшить число переводов — это упрощённая схема, всегда честная по суммам.
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {settlements.map((s, i) => (
            <div key={i} className="bg-muted/40 rounded-xl px-3 py-2.5">
              {/* Главная строка: от → кому + сумма */}
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-full grid place-items-center text-[10px] shrink-0" style={{ background: s.from.color }}>
                  {s.from.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{s.from.name}</div>
                  <div className="text-[10px] text-red-500">должен</div>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
                <div className="size-7 rounded-full grid place-items-center text-[10px] shrink-0" style={{ background: s.to.color }}>
                  {s.to.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{s.to.name}</div>
                  <div className="text-[10px] text-green-600">получит</div>
                </div>
                <span className="font-bold text-primary text-sm shrink-0">${s.amount.toFixed(2)}</span>
              </div>
              {/* Кнопка отметки */}
              <div className="mt-2 flex justify-end">
                <MarkSettledButton from={s.from} to={s.to} amount={s.amount} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-green-600 text-center py-2">Все расчёты ровны 🎉</div>
      )}
    </div>
  );
}
