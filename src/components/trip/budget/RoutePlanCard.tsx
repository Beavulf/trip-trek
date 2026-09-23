"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Compass, Loader2 } from "lucide-react";
import { useRouteDays, useTrip } from "@/hooks/use-trip";
import { calculatePlannedRoute } from "@/lib/budget";
import { CATEGORY_META } from "@/lib/types";
import { currencySymbol } from "@/lib/currencies";
import { cn, fmtMoney, plural } from "@/lib/utils";

type PlanMode = "days" | "categories";

/**
 * «План по маршруту» — сколько планируется потратить по бюджетам, размеченным
 * в местах маршрута (Place.budget). Сводка по всей поездке + расшифровка
 * по дням и по категориям мест, каждая сумма — и всего, и на человека.
 */
export function RoutePlanCard() {
  const { data: trip } = useTrip();
  const { data: days, isLoading } = useRouteDays();
  const [mode, setMode] = useState<PlanMode>("days");
  const sym = currencySymbol(trip?.settings.currency);
  const participantsCount = trip?.participants.length ?? 0;

  const stats = useMemo(
    () => (days ? calculatePlannedRoute(days, participantsCount) : null),
    [days, participantsCount]
  );

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card border border-border p-4 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" /> Считаем план маршрута…
      </div>
    );
  }
  // Без разметки budgets в местах блок не нужен — нечего показывать
  if (!stats || stats.total <= 0) return null;

  const visibleDays = stats.days.filter((d) => d.total > 0);
  const maxDay = Math.max(...visibleDays.map((d) => d.total), 1);
  const maxCat = Math.max(...stats.categories.map((c) => c.total), 1);
  const withBudget = stats.days.reduce((s, d) => s + d.withBudget, 0);
  const placesCount = stats.days.reduce((s, d) => s + d.placesCount, 0);

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      {/* Шапка: итог плана на поездку */}
      <div className="flex items-center gap-2 mb-1">
        <Compass className="size-4 text-primary" />
        <h2 className="font-semibold text-sm">План по маршруту</h2>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {withBudget}/{placesCount} {plural(placesCount, "места", "мест", "мест")} с суммой
        </span>
      </div>
      <div className="flex items-end gap-2 flex-wrap mb-3">
        <span className="text-2xl font-bold tabular-nums leading-none">{sym}{fmtMoney(stats.total)}</span>
        <span className="text-xs text-muted-foreground pb-0.5">
          ≈ {sym}{fmtMoney(stats.perPerson)} на человека · {plural(participantsCount, "участник", "участника", "участников")}: {participantsCount}
        </span>
      </div>

      {/* Переключатель расшифровки */}
      <div className="flex gap-1.5 mb-3">
        {([
          { key: "days", label: "По дням" },
          { key: "categories", label: "По категориям" },
        ] as const).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            aria-pressed={mode === m.key}
            className={cn(
              "min-h-9 px-3 rounded-full text-xs font-medium border transition-colors active:scale-95",
              mode === m.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "days" ? (
        <div className="space-y-2.5">
          {visibleDays.map((d) => (
            <div key={d.dayId}>
              <div className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ background: d.accentColor ?? "#f97316" }}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium truncate">
                  День {d.dayNumber}
                  {d.city ? <span className="text-muted-foreground"> · {d.city}</span> : null}
                </span>
                <span className="ml-auto shrink-0 text-right">
                  <span className="text-sm font-semibold tabular-nums">{sym}{fmtMoney(d.total)}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums ml-1.5">≈ {sym}{fmtMoney(d.perPerson)}/чел</span>
                </span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden mt-1 ml-4">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(4, (d.total / maxDay) * 100)}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: d.accentColor ?? "#f97316" }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {stats.categories.map((c) => {
            const meta = CATEGORY_META[c.category];
            const color = meta?.color ?? "#64748b";
            return (
              <div key={c.category}>
                <div className="flex items-center gap-2">
                  <span
                    className="size-6 rounded-lg grid place-items-center text-xs shrink-0"
                    style={{ background: `${color}22` }}
                    aria-hidden="true"
                  >
                    {meta?.emoji ?? "📌"}
                  </span>
                  <span className="text-sm font-medium truncate">{meta?.label ?? c.category}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {c.count} {plural(c.count, "место", "места", "мест")}
                  </span>
                  <span className="ml-auto shrink-0 text-right">
                    <span className="text-sm font-semibold tabular-nums">{sym}{fmtMoney(c.total)}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums ml-1.5">≈ {sym}{fmtMoney(c.perPerson)}/чел</span>
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden mt-1 ml-8">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(4, (c.total / maxCat) * 100)}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stats.unpricedPlaces > 0 && (
        <p className="text-[11px] text-muted-foreground mt-3">
          {stats.unpricedPlaces} {plural(stats.unpricedPlaces, "место", "места", "мест")} без суммы —
          укажи бюджет в карточке места, и план станет полнее.
        </p>
      )}
    </div>
  );
}
