"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/trip/user-avatar";
import { ACTION_META, EmptyState, TARGET_META, fmtDateTime, relTime } from "./shared";

interface JournalRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  admin: { id: string; name: string; emoji: string; color: string; avatarUrl: string | null } | null;
}

const FILTERS = [
  { value: "", label: "Все" },
  { value: "user", label: "Юзеры" },
  { value: "trip", label: "Поездки" },
  { value: "feedback", label: "Отзывы" },
  { value: "settings", label: "Настройки" },
  { value: "storage", label: "Хранилище" },
] as const;

/** Компактная сводка meta: показываем только осмысленные ключи */
function metaSummary(row: JournalRow): string {
  if (!row.meta) return "";
  const parts: string[] = [];
  const m = row.meta as Record<string, unknown>;
  if (typeof m.plan === "string") parts.push(m.plan === "premium" ? `premium${m.days ? ` · ${m.days} дн` : " · бессрочно"}` : "снят premium");
  if (typeof m.role === "string") parts.push(`роль: ${m.role}`);
  if (Array.isArray(m.fields) && m.fields.length > 0) parts.push(m.fields.join(", "));
  if (typeof m.status === "string") parts.push(`статус: ${m.status}`);
  if (typeof m.deleted === "number") parts.push(`удалено файлов: ${m.deleted}`);
  if (typeof m.members === "number") parts.push(`${m.members} уч.`);
  if (typeof m.registrationEnabled === "boolean") parts.push(m.registrationEnabled ? "регистрация открыта" : "регистрация закрыта");
  if (typeof m.freeTripLimit === "number") parts.push(`поездки: ${m.freeTripLimit}`);
  if (typeof m.freeMemberLimit === "number") parts.push(`участники: ${m.freeMemberLimit}`);
  return parts.join(" · ");
}

export function JournalTab() {
  const [target, setTarget] = useState<string>("");

  const { data: rows, isLoading } = useQuery<JournalRow[]>({
    queryKey: ["admin-journal", target],
    queryFn: async () => {
      const r = await fetch(`/api/admin/journal${target ? `?target=${target}` : ""}`);
      if (!r.ok) throw new Error("fetch journal failed");
      return r.json();
    },
    staleTime: 15_000,
  });

  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar chip-snap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setTarget(f.value)}
            className={cn(
              "px-3 min-h-9 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors",
              target === f.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : !rows?.length ? (
        <EmptyState
          emoji="📜"
          title="Записей пока нет"
          hint="Здесь появится каждое действие из панели: кто, что и когда менял"
        />
      ) : (
        <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
          {rows.map((row, i) => {
            const action = ACTION_META[row.action] || { label: row.action, icon: Loader2 };
            const Icon = action.icon;
            const targetMeta = TARGET_META[row.targetType];
            const summary = metaSummary(row);
            return (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.25) }}
                className="flex items-start gap-3 px-3.5 py-3"
              >
                <span
                  className="size-9 rounded-xl grid place-items-center shrink-0 mt-0.5"
                  style={{ background: `${targetMeta?.color || "#94a3b8"}18` }}
                >
                  <Icon className={cn("size-4", action.danger ? "text-destructive" : "text-muted-foreground")} style={!action.danger ? { color: targetMeta?.color } : undefined} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-semibold">{action.label}</span>
                    {row.targetLabel && <span className="text-muted-foreground"> — {row.targetLabel}</span>}
                  </div>
                  {summary && (
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-0.5 truncate">
                      {summary}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {row.admin ? (
                      <>
                        <UserAvatar name={row.admin.name} emoji={row.admin.emoji} color={row.admin.color} avatarUrl={row.admin.avatarUrl} className="size-4 text-[8px]" />
                        <span className="text-[10px] text-muted-foreground">{row.admin.name}</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">админ удалён</span>
                    )}
                    <span className="text-[10px] text-muted-foreground/60">·</span>
                    <span className="font-mono text-[10px] text-muted-foreground/70" title={fmtDateTime(row.createdAt)}>
                      {relTime(row.createdAt)}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}
