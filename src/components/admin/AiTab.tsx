"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BookOpen,
  Bot,
  Check,
  Compass,
  Footprints,
  Languages,
  Loader2,
  Soup,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/trip/user-avatar";
import { Switch } from "@/components/ui/switch";
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
import { useAdminAi, type AdminAiData, type AdminAiUserRow } from "@/hooks/use-admin-ai";
import { EmptyState, FlipNumber, Stamp, relTime } from "./shared";

// Пульт ИИ-телеметрии штаба: табло суток, 14-дневный график по фичам,
// юзеры с порогами трат и журнал последних вызовов. Учёт ведёт runAi (lib/ai.ts).

// Первые три — var(--chart-1..3) как в Обзоре; новые фичи — секционные/категорийные цвета.
const FEATURES = [
  { id: "ai-summary", label: "Рассказы", icon: BookOpen, color: "var(--chart-1)" },
  { id: "foods-suggest", label: "Шеф", icon: UtensilsCrossed, color: "var(--chart-2)" },
  { id: "phrases-ai", label: "Фразы", icon: Languages, color: "var(--chart-3)" },
  { id: "planner", label: "Планер", icon: Compass, color: "#d946ef" },
  { id: "restaurants", label: "Заведения", icon: Soup, color: "#16a34a" },
  { id: "walk", label: "Прогулки", icon: Footprints, color: "#0ea5e9" },
] as const;

const KEY_SOURCE_META: Record<string, { label: string; className: string }> = {
  user: { label: "свой ключ", className: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" },
  admin: { label: "общий", className: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10" },
  env: { label: "env", className: "text-amber-600 dark:text-amber-400 bg-amber-500/10" },
};

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export function AiTab({ fallback }: { fallback?: React.ReactNode }) {
  const { data, isLoading } = useAdminAi();

  if (isLoading || !data) {
    return <div className="flex justify-center py-20">{fallback ?? <Loader2 className="size-8 animate-spin text-muted-foreground" />}</div>;
  }

  const alertsOn = data.thresholds.calls > 0 || data.thresholds.tokens > 0;

  return (
    <div className="space-y-4">
      {/* === Табло суток === */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <HeroCell label="вызовов сегодня" value={data.today.calls} />
        <HeroCell label="токенов сегодня" value={data.today.tokens} format={fmtCompact} />
        <HeroCell label="юзеров сегодня" value={data.today.users} />
        <HeroCell label="вызовов за неделю" value={data.week.calls} />
      </div>

      {/* === Полоса алертов === */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs",
          alertsOn ? "border-border bg-card" : "border-dashed border-border bg-transparent text-muted-foreground"
        )}
      >
        <Bot className={cn("size-4 shrink-0", alertsOn ? "text-[#d946ef]" : "text-muted-foreground")} />
        {alertsOn ? (
          <>
            <span className="font-medium">Алерты трат включены:</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {data.thresholds.calls > 0 ? `> ${data.thresholds.calls} вызовов/сутки` : null}
              {data.thresholds.calls > 0 && data.thresholds.tokens > 0 ? " · " : null}
              {data.thresholds.tokens > 0 ? `> ${fmtCompact(data.thresholds.tokens)} токенов/сутки` : null}
            </span>
          </>
        ) : (
          <span>Алерты выключены — задай пороги в Настройках, чтобы узнать о нестандартных тратах</span>
        )}
      </div>

      {/* === График 14 дней === */}
      <UsageChart data={data} />

      {/* === Юзеры === */}
      <UsersCard data={data} />

      {/* === Журнал последних вызовов === */}
      <RecentCard data={data} />
    </div>
  );
}

function HeroCell({ label, value, format }: { label: string; value: number; format?: (n: number) => string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-2xl lg:text-3xl font-black leading-none">
        <FlipNumber value={format ? format(value) : value} />
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70 mt-2">{label}</div>
    </div>
  );
}

function UsageChart({ data }: { data: AdminAiData }) {
  const [metric, setMetric] = useState<"calls" | "tokens">("calls");
  const hasData = data.series14d.some((d) => d.totalCalls > 0);

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-sm">Активность · 14 дней</h2>
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {(
            [
              { id: "calls", label: "Вызовы" },
              { id: "tokens", label: "Токены" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={metric === m.id}
              onClick={() => setMetric(m.id)}
              className={cn(
                "px-2.5 min-h-8 rounded-lg text-xs font-medium transition-all",
                metric === m.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <EmptyState emoji="🛰️" title="Вызовов пока не было" hint="Как только кто-то попросит у ИИ рассказ, фразы или совет шефа — здесь появится график" />
      ) : (
        <div className="h-56 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            {metric === "calls" ? (
              <BarChart data={data.series14d} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(8)} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
                {FEATURES.map((f) => (
                  <Bar key={f.id} dataKey={`calls.${f.id}`} name={f.label} stackId="a" fill={f.color} radius={0} maxBarSize={22} />
                ))}
              </BarChart>
            ) : (
              <AreaChart data={data.series14d} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  {FEATURES.map((f) => (
                    <linearGradient key={f.id} id={`grad-${f.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={f.color} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={f.color} stopOpacity={0.05} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(8)} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={44} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
                {FEATURES.map((f, i) => (
                  <Area key={f.id} dataKey={`tokens.${f.id}`} name={f.label} stackId="t" stroke={f.color} fill={`url(#grad-${f.id})`} strokeWidth={i === 0 ? 1.5 : 1} />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function KeySourceBadge({ source }: { source: string }) {
  const meta = KEY_SOURCE_META[source];
  if (!meta) return null;
  return (
    <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap", meta.className)}>{meta.label}</span>
  );
}

function UsersCard({ data }: { data: AdminAiData }) {
  const qc = useQueryClient();
  const [confirmBlock, setConfirmBlock] = useState<AdminAiUserRow | null>(null);

  const toggle = useMutation({
    mutationFn: async (vars: { id: string; aiBlocked: boolean }) => {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось сохранить");
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-ai"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-journal"] });
      toast.success(vars.aiBlocked ? "ИИ отключён" : "ИИ включён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data.users;

  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-sm">Юзеры · 7 дней</h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">топ {rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState emoji="🤖" title="ИИ ещё никто не пользовался" />
      ) : (
        <>
          {/* Мобильные карточки */}
          <div className="lg:hidden space-y-2">
            {rows.map((u) => (
              <div key={u.id} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center gap-2.5">
                  <UserAvatar name={u.name} emoji={u.emoji} color={u.color} avatarUrl={u.avatarUrl} className="size-9 text-base" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      <span className="truncate">{u.name}</span>
                      {u.overThreshold && <Stamp label="Предел" color="#f59e0b" />}
                      {u.aiBlocked && <Stamp label="Без ИИ" color="#ef4444" />}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground/70">{relTime(u.lastUsedAt)}</div>
                  </div>
                  <Switchish blocked={u.aiBlocked} busy={toggle.isPending} onBlock={() => setConfirmBlock(u)} onUnblock={() => toggle.mutate({ id: u.id, aiBlocked: false })} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground tabular-nums">
                  <span>сегодня: {u.callsToday} выз. / {fmtCompact(u.tokensToday)} ток.</span>
                  <span>7д: {u.calls7d} выз.</span>
                  <KeySourceBadge source={u.keySource} />
                </div>
              </div>
            ))}
          </div>

          {/* Таблица на ПК */}
          <div className="hidden lg:block rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  {["Юзер", "Сегодня", "Токены", "7 дней", "Ключ", "ИИ"].map((h, i) => (
                    <th
                      key={i}
                      className={cn(
                        "px-3 py-2 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground",
                        i > 0 && i < 4 && "text-right"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((u) => (
                  <tr key={u.id} className={cn("hover:bg-accent/40 transition-colors", u.overThreshold && "bg-amber-500/5")}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar name={u.name} emoji={u.emoji} color={u.color} avatarUrl={u.avatarUrl} className="size-8 text-sm" />
                        <div className="min-w-0">
                          <div className="font-medium truncate flex items-center gap-1.5 text-[13px]">
                            <span className="truncate">{u.name}</span>
                            {u.overThreshold && <Stamp label="Предел" color="#f59e0b" />}
                            {u.alertedToday && !u.overThreshold && <Bot className="size-3.5 text-amber-500 shrink-0" aria-label="Алертил сегодня" />}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{u.callsToday}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtCompact(u.tokensToday)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{u.calls7d}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <KeySourceBadge source={u.keySource} />
                        {u.aiBlocked && <Stamp label="Без ИИ" color="#ef4444" />}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Switchish blocked={u.aiBlocked} busy={toggle.isPending} onBlock={() => setConfirmBlock(u)} onUnblock={() => toggle.mutate({ id: u.id, aiBlocked: false })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Подтверждение блокировки из таблицы */}
      <AlertDialog open={!!confirmBlock} onOpenChange={(v) => !v && setConfirmBlock(null)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Отключить ИИ для {confirmBlock?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Все ИИ-функции перестанут работать — даже с личным ключом. Пользователь получит уведомление.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmBlock) toggle.mutate({ id: confirmBlock.id, aiBlocked: true });
                setConfirmBlock(null);
              }}
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              Отключить ИИ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Переключатель доступа: блокировка идёт через подтверждение (паттерн UsersTab) */
function Switchish({ blocked, busy, onBlock, onUnblock }: { blocked: boolean; busy: boolean; onBlock: () => void; onUnblock: () => void }) {
  return (
    <Switch
      checked={!blocked}
      disabled={busy}
      aria-label={blocked ? "Включить ИИ" : "Выключить ИИ"}
      onCheckedChange={(v) => (v ? onUnblock() : onBlock())}
    />
  );
}

function RecentCard({ data }: { data: AdminAiData }) {
  const featureMeta = (id: string) => FEATURES.find((f) => f.id === id);
  return (
    <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
      <h2 className="font-semibold text-sm mb-1">Последние вызовы</h2>
      {data.recent.length === 0 ? (
        <EmptyState emoji="📭" title="Журнал пуст" />
      ) : (
        <div className="divide-y divide-border">
          {data.recent.map((r) => {
            const f = featureMeta(r.feature);
            return (
              <div key={r.id} className="flex items-center gap-2.5 py-2 min-w-0">
                <span className="size-8 rounded-lg bg-secondary grid place-items-center shrink-0">
                  {f ? <f.icon className="size-3.5 text-muted-foreground" /> : <Bot className="size-3.5 text-muted-foreground" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{f?.label ?? r.feature}</span>
                    <span className="text-muted-foreground truncate">· {r.user?.name ?? "юзер удалён"}</span>
                    <KeySourceBadge source={r.keySource} />
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground/70 tabular-nums truncate">
                    {relTime(r.createdAt)} · {r.model} · {r.promptTokens + r.completionTokens} ток. · {(r.durationMs / 1000).toFixed(1)}с
                  </div>
                </div>
                {r.ok ? (
                  <Check className="size-3.5 text-emerald-500 shrink-0" aria-label="успешно" />
                ) : (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive shrink-0">{r.error ?? "ошибка"}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
