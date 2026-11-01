"use client";

import { Pencil, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Participant } from "@/lib/types";
import { budgetMeter } from "@/lib/budget/overview";
import { moneyWhole } from "@/lib/budget/format";
import { BudgetMeter } from "./BudgetMeter";
import { UserAvatar } from "../user-avatar";

interface PeopleBudgetsProps {
  people: Participant[];
  /** Чистые траты каждого: из кошелька, с учётом вернувшихся переводов */
  netSpent: Record<string, number>;
  sym: string;
  currentUserId: string;
  /** Зритель бюджеты не правит */
  canEdit: boolean;
  onConfigure: () => void;
  totalBudget: number;
  budgetSource?: "members" | "trip";
}

/**
 * «Бюджет каждого». Крупно — то, что человек хочет узнать: сколько осталось или на сколько вышел
 * за лимит. Сам лимит уже не проблема, поэтому он тихий, в строке с тратами.
 */
export function PeopleBudgets({ people, netSpent, sym, currentUserId, canEdit, onConfigure, totalBudget, budgetSource }: PeopleBudgetsProps) {
  // Себя ищут первым делом: своя строка всегда сверху
  const ordered = [...people].sort((a, b) => Number(b.id === currentUserId) - Number(a.id === currentUserId));

  return (
    <section aria-labelledby="budget-people-title" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="budget-people-title" className="flex items-center gap-2 text-sm font-semibold">
          <UserCircle className="size-4" aria-hidden="true" /> Бюджет каждого
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={onConfigure}
            className="-my-2 -mr-1 flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-xs font-medium text-primary hover:underline"
          >
            <Pencil className="size-3.5" aria-hidden="true" /> Настроить
          </button>
        )}
      </div>

      <ul className="mt-2 divide-y divide-border">
        {ordered.map((p) => (
          <PersonRow key={p.id} person={p} spent={netSpent[p.id] ?? 0} sym={sym} isMe={p.id === currentUserId} />
        ))}
      </ul>

      <p className="mt-2 text-xs text-pretty text-muted-foreground">
        {budgetSource === "members"
          ? "Из этих сумм складывается бюджет поездки. "
          : totalBudget > 0
            ? `Бюджет поездки ${moneyWhole(sym, totalBudget)} задан вручную: личные лимиты заполнены не у всех. `
            : ""}
        Траты указаны с учётом вернувшихся долгов.
      </p>
    </section>
  );
}

function PersonRow({ person, spent, sym, isMe }: { person: Participant; spent: number; sym: string; isMe: boolean }) {
  const meter = budgetMeter(spent, person.budget);
  const over = meter.state === "over";
  const hasBudget = meter.state !== "none";

  return (
    <li className="flex items-center gap-3 py-2.5">
      <UserAvatar
        name={person.name}
        emoji={person.emoji}
        color={person.color}
        avatarUrl={person.avatarUrl}
        className="size-9"
        textClassName="text-sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium">
            {person.name}
            {isMe && <span className="ml-1.5 text-[11px] font-medium text-primary">ты</span>}
            {person.former && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">вышел</span>}
          </span>
          {hasBudget && (
            <span className={cn("shrink-0 text-sm font-semibold tabular-nums", over && "text-red-600 dark:text-red-400")}>
              {moneyWhole(sym, over ? meter.overBy : meter.remaining)}
            </span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground tabular-nums">
          <span className="min-w-0 truncate">
            {moneyWhole(sym, spent)}
            {hasBudget && ` из ${moneyWhole(sym, person.budget ?? 0)}`}
          </span>
          <span className="shrink-0">{!hasBudget ? "без лимита" : over ? "сверх лимита" : "осталось"}</span>
        </div>
        {hasBudget && (
          <BudgetMeter
            meter={meter}
            className="mt-1.5 h-1.5 bg-muted"
            fillClassName={meter.state === "near" ? "bg-amber-500" : "bg-foreground/45"}
            overClassName="bg-red-500"
          />
        )}
      </div>
    </li>
  );
}
