"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPLIT_CATEGORIES } from "@/lib/split/categories";
import { addMonths, localDateKey, monthLabel, monthOf } from "@/lib/split/dates";
import { formatCents } from "@/lib/split/money";
import { availableMonths, monthStats } from "@/lib/split/stats";
import type { GroupModel } from "@/hooks/split/use-group-model";
import { EmptyState, MemberAvatar, Segmented } from "./ui";

type Scope = "group" | "me";

/** Кольцо категорий: чистый SVG, без графической библиотеки — вкладка открывается мгновенно. */
function Donut({ parts, total, label }: { parts: { color: string; cents: number }[]; total: string; label: string }) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const sum = parts.reduce((a, p) => a + p.cents, 0) || 1;
  // Смещение каждого сектора — сумма длин предыдущих (считаем заранее: в рендере переменные не переприсваиваем)
  const segments = parts.map((p, i) => ({
    ...p,
    len: (p.cents / sum) * C,
    start: (parts.slice(0, i).reduce((a, q) => a + q.cents, 0) / sum) * C,
  }));
  return (
    <div className="relative size-36 shrink-0" role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="12" className="stroke-muted" />
        {segments.map((seg, i) => {
          // Зазор между секторами, если их несколько: границы читаются без обводки
          const gap = parts.length > 1 ? Math.min(1.2, seg.len / 3) : 0;
          return (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="12"
              stroke={seg.color}
              strokeDasharray={`${Math.max(seg.len - gap, 0.01)} ${C}`}
              strokeDashoffset={-seg.start}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center px-5">
        <span className="text-sm font-bold tabular-nums leading-tight break-words">{total}</span>
      </div>
    </div>
  );
}

export function InsightsTab({ model }: { model: GroupModel }) {
  const group = model.group!;
  const me = group.myMemberId;
  const today = useMemo(() => localDateKey(), []);
  const currentMonth = monthOf(today);
  const months = useMemo(() => availableMonths(model.expenses, currentMonth), [model.expenses, currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const [scope, setScope] = useState<Scope>("group");

  const cur = useMemo(() => monthStats(model.expenses, month, me), [model.expenses, month, me]);
  const prev = useMemo(() => monthStats(model.expenses, addMonths(month, -1), me), [model.expenses, month, me]);

  const mine = scope === "me";
  const total = mine ? cur.myTotalCents : cur.totalCents;
  const prevTotal = mine ? prev.myTotalCents : prev.totalCents;
  const cats = mine ? cur.myByCategory : cur.byCategory;
  const delta = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  const idx = months.indexOf(month);
  const older = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;
  const newer = idx > 0 ? months[idx - 1] : null;

  const maxDay = Math.max(1, ...cur.byDay.map((d) => d.cents));
  const people = useMemo(() => {
    const ids = new Set([...cur.byPayer.map((p) => p.memberId), ...cur.byConsumer.map((p) => p.memberId)]);
    const paid = new Map(cur.byPayer.map((p) => [p.memberId, p.cents]));
    const used = new Map(cur.byConsumer.map((p) => [p.memberId, p.cents]));
    return [...ids]
      .map((id) => ({ id, paid: paid.get(id) ?? 0, used: used.get(id) ?? 0, member: model.membersById.get(id) }))
      .sort((a, b) => b.used - a.used);
  }, [cur, model.membersById]);
  const maxPerson = Math.max(1, ...people.flatMap((p) => [p.paid, p.used]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => older && setMonth(older)} disabled={!older} aria-label="Предыдущий месяц" className="size-11 rounded-xl grid place-items-center hover:bg-accent disabled:opacity-30 active:scale-95 transition-transform">
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="font-semibold text-base">{monthLabel(month)}</h2>
        <button type="button" onClick={() => newer && setMonth(newer)} disabled={!newer} aria-label="Следующий месяц" className="size-11 rounded-xl grid place-items-center hover:bg-accent disabled:opacity-30 active:scale-95 transition-transform">
          <ChevronRight className="size-5" />
        </button>
      </div>

      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: "group", label: "Вся группа" },
          { value: "me", label: "Моя доля" },
        ]}
      />

      {cur.count === 0 ? (
        <div className="rounded-2xl bg-card border border-border">
          <EmptyState emoji="📊" title="В этом месяце трат нет" text="Когда появятся траты, здесь будут категории, сравнение с прошлым месяцем и вклад каждого." />
        </div>
      ) : (
        <>
          <section className="rounded-2xl bg-card border border-border p-4">
            <div className="text-xs text-muted-foreground">{mine ? "Твоя доля за месяц" : "Потратили вместе"}</div>
            <div className="text-3xl font-bold tabular-nums mt-0.5">{formatCents(total, group.currency)}</div>
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
              {delta === null ? (
                prevTotal === 0 && <span>в прошлом месяце трат не было</span>
              ) : (
                <>
                  {delta > 0 ? <TrendingUp className="size-3.5 text-rose-500" /> : <TrendingDown className="size-3.5 text-emerald-500" />}
                  <span className={cn("font-medium", delta > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                    {delta > 0 ? "+" : ""}
                    {delta}%
                  </span>
                  <span>к прошлому месяцу ({formatCents(prevTotal, group.currency)})</span>
                </>
              )}
            </div>
            {!mine && <div className="mt-1 text-[11px] text-muted-foreground">{cur.count} трат · в среднем {formatCents(Math.round(total / cur.count), group.currency)}</div>}
          </section>

          <section className="rounded-2xl bg-card border border-border p-4">
            <h3 className="font-semibold text-sm mb-3">По категориям</h3>
            <div className="flex items-center gap-4">
              <Donut
                parts={cats.map((c) => ({ color: SPLIT_CATEGORIES[c.category].color, cents: c.cents }))}
                total={formatCents(total, group.currency)}
                label={`Категории: ${cats.slice(0, 3).map((c) => SPLIT_CATEGORIES[c.category].label).join(", ")}`}
              />
              <ul className="flex-1 min-w-0 space-y-1.5">
                {cats.slice(0, 5).map((c) => (
                  <li key={c.category} className="flex items-center gap-2 text-xs">
                    <span className="size-2.5 rounded-full shrink-0" style={{ background: SPLIT_CATEGORIES[c.category].color }} aria-hidden />
                    <span className="flex-1 min-w-0 truncate">{SPLIT_CATEGORIES[c.category].label}</span>
                    <span className="tabular-nums text-muted-foreground">{Math.round((c.cents / (total || 1)) * 100)}%</span>
                  </li>
                ))}
                {cats.length > 5 && <li className="text-[11px] text-muted-foreground pl-4.5">и ещё {cats.length - 5}</li>}
              </ul>
            </div>
            <ul className="mt-4 space-y-2.5">
              {cats.map((c) => {
                const cat = SPLIT_CATEGORIES[c.category];
                return (
                  <li key={c.category}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span aria-hidden>{cat.emoji}</span>
                        <span className="truncate">{cat.label}</span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatCents(c.cents, group.currency)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, (c.cents / (cats[0].cents || 1)) * 100)}%`, background: cat.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {!mine && cur.byDay.length > 1 && (
            <section className="rounded-2xl bg-card border border-border p-4">
              <h3 className="font-semibold text-sm mb-3">По дням</h3>
              <div className="flex items-end gap-[3px] h-24" role="img" aria-label="Траты по дням месяца">
                {cur.byDay.map((d) => (
                  <div key={d.date} className="flex-1 min-w-[3px] rounded-t-sm bg-primary/70 hover:bg-primary transition-colors" style={{ height: `${Math.max(4, (d.cents / maxDay) * 100)}%` }} title={`${d.date.slice(8)}.${d.date.slice(5, 7)} · ${formatCents(d.cents, group.currency)}`} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5 tabular-nums">
                <span>{cur.byDay[0].date.slice(8)}.{cur.byDay[0].date.slice(5, 7)}</span>
                <span>макс. {formatCents(maxDay, group.currency)}</span>
                <span>{cur.byDay[cur.byDay.length - 1].date.slice(8)}.{cur.byDay[cur.byDay.length - 1].date.slice(5, 7)}</span>
              </div>
            </section>
          )}

          {!mine && people.length > 0 && (
            <section className="rounded-2xl bg-card border border-border p-4">
              <h3 className="font-semibold text-sm">Кто сколько</h3>
              <p className="text-[11px] text-muted-foreground mb-3">Заплатил из кармана и сколько пришлось на человека</p>
              <ul className="space-y-3">
                {people.map((p) => (
                  <li key={p.id}>
                    <div className="flex items-center gap-2 mb-1.5">
                      {p.member && <MemberAvatar member={p.member} className="size-6" />}
                      <span className="text-sm font-medium truncate flex-1">{p.id === me ? "Я" : (p.member?.name ?? "Бывший участник")}</span>
                    </div>
                    <Bar label="заплатил(а)" cents={p.paid} max={maxPerson} currency={group.currency} className="bg-primary" />
                    <Bar label="на долю" cents={p.used} max={maxPerson} currency={group.currency} className="bg-muted-foreground/50" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Bar({ label, cents, max, currency, className }: { label: string; cents: number; max: number; currency: string; className: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] mb-1">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", className)} style={{ width: `${(cents / max) * 100}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right tabular-nums font-medium">{formatCents(cents, currency)}</span>
    </div>
  );
}
