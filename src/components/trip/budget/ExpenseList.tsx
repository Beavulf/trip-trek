"use client";

import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Expense, Participant } from "@/lib/types";
import { groupByDay } from "@/lib/budget/history";
import { fmtMoney } from "@/lib/utils";
import { ExpenseRow } from "./ExpenseRow";

// После «Показать ещё» строк бывают сотни: motion-узлы с height-анимацией на каждой тормозят телефон
const ANIMATE_LIMIT = 40;

/**
 * История трат по дням: заголовок «Сегодня · $45», «Вчера», «12 октября» + строки. Новая трата
 * плавно раскрывается и сдвигает остальные, удалённая сворачивается (оптимистично — до ответа сервера).
 * Первая отрисовка и reduced-motion — без анимации.
 */
export function ExpenseList({
  expenses,
  participants,
  sym,
}: {
  expenses: Expense[];
  participants: Participant[];
  sym: string;
}) {
  const reduce = useReducedMotion();
  const groups = useMemo(() => groupByDay(expenses), [expenses]);
  const animated = !reduce && expenses.length <= ANIMATE_LIMIT;

  return (
    <div className="space-y-2.5">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <div className="flex items-baseline justify-between px-1 pb-1 text-[11px] text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">{g.label}</span>
            {g.total > 0 && (
              <span className="tabular-nums" title="Траты за день без переводов">
                {sym}
                {fmtMoney(g.total)}
              </span>
            )}
          </div>
          <AnimatePresence initial={false}>
            {g.items.map((e) =>
              animated ? (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0, paddingBottom: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="pb-1.5 overflow-hidden"
                >
                  <ExpenseRow expense={e} participants={participants} />
                </motion.div>
              ) : (
                <div key={e.id} className="pb-1.5">
                  <ExpenseRow expense={e} participants={participants} />
                </div>
              )
            )}
          </AnimatePresence>
        </section>
      ))}
    </div>
  );
}
