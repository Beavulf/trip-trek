"use client";

import { AlertTriangle } from "lucide-react";
import { fmtMoney } from "@/lib/utils";
import type { MemberDebt } from "@/hooks/trip/use-member-debts";

/**
 * Предупреждение в диалогах выхода/исключения: у участника есть незакрытые долги.
 * Ничего не блокирует — долги остаются в расчёте поездки с пометкой «вышел».
 * Сумма в USD: единая валюта хранения трат (lib/currencies BASE_CURRENCY).
 */
export function DebtWarning({
  debts,
  subject,
}: {
  debts: MemberDebt[] | undefined;
  /** «У тебя» / «У Ани» — подлежащее первой фразы */
  subject: string;
}) {
  if (!debts || debts.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1.5">
      <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="size-3.5 shrink-0" /> {subject} есть незакрытые долги
      </div>
      <ul className="space-y-0.5 text-foreground/90">
        {debts.map((d) => (
          <li key={`${d.direction}-${d.otherId}`}>
            {d.direction === "owes" ? "должен" : "ему должен"} {d.otherName}: <b>${fmtMoney(d.amount)}</b>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Долги останутся в расчёте с пометкой «вышел». Лучше рассчитаться до выхода.
      </p>
    </div>
  );
}
