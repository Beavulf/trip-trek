"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Crown, ShieldCheck, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "./user-avatar";
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

export interface MemberRow {
  id: string; // userId участника
  name: string;
  emoji: string;
  color: string;
  role: string | null;
  joinedAt?: string;
  email?: string | null;
  avatarUrl?: string | null;
}

interface BanRow {
  id: string;
  reason: string | null;
  createdAt: string;
  user: { id: string; name: string; emoji: string; color: string; avatarUrl: string | null };
}

/**
 * Список участников поездки с управлением для владельца:
 * передать владение / исключить / заблокировать (+ разбан).
 * detailed — расширенные строки (даты, email) для окна «О поездке»;
 * компактный режим — для шторки «Пригласить друзей».
 */
export function MemberManager({
  tripId,
  members,
  refetch,
  detailed = false,
}: {
  tripId: string;
  members: MemberRow[];
  refetch: () => Promise<unknown>;
  detailed?: boolean;
}) {
  const { data: session } = useAuth();
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ kind: "remove" | "ban" | "transfer"; userId: string; name: string } | null>(null);

  const ownerMember = members.find((m) => m.role === "owner");
  const isOwner = !!session?.user?.id && ownerMember?.id === session.user.id;
  const others = detailed ? members.filter((m) => m.role !== "owner") : members.filter((m) => m.role !== "owner");

  const { data: bans } = useQuery<BanRow[]>({
    queryKey: ["trip-bans", tripId],
    queryFn: async () => {
      const r = await fetch(`/api/participants/ban?tripId=${tripId}`);
      if (!r.ok) throw new Error("fetch bans failed");
      return r.json();
    },
    enabled: isOwner,
  });

  const memberAction = useMutation({
    mutationFn: async (opts: { url: string; method: "POST" | "DELETE" | "PATCH"; body?: Record<string, unknown> }) => {
      const r = await fetch(opts.url, {
        method: opts.method,
        headers: opts.body ? { "Content-Type": "application/json" } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не получилось");
      return json;
    },
    onSuccess: () => {
      setPending(null);
      void refetch();
      qc.invalidateQueries({ queryKey: ["trip-bans", tripId] });
      toast.success("Готово — участник получил уведомление");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isOwner && others.length === 0) return null;

  const fmtJoined = (ts?: string) =>
    ts ? new Date(ts).toLocaleDateString("ru-RU") : null;

  return (
    <>
      <div className={cn("space-y-2", detailed && "rounded-2xl border border-border p-3")}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {detailed ? `Участники · ${members.length}` : "Управление участниками"}
        </span>
        <div className={cn(detailed ? "space-y-0.5" : "divide-y divide-border -mx-1")}>
          {(detailed ? members : others).map((m) => {
            const isRowOwner = m.role === "owner";
            const manageable = isOwner && !isRowOwner;
            return (
              <div key={m.id} className={cn("flex items-center gap-2.5", detailed ? "px-1 py-2" : "px-1 py-2")}>
                <UserAvatar
                  name={m.name}
                  emoji={m.emoji}
                  color={m.color}
                  avatarUrl={m.avatarUrl}
                  className={detailed ? "size-9 text-base" : "size-8 text-sm border-2 border-card"}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate flex items-center gap-1.5">
                    <span className="truncate">{m.name}</span>
                    {isRowOwner && (
                      <span className="text-[8px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 shrink-0">
                        владелец
                      </span>
                    )}
                  </div>
                  {detailed && (
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70 truncate">
                      {m.email ? `${m.email} · ` : ""}в поездке с {fmtJoined(m.joinedAt) || "—"}
                    </div>
                  )}
                </div>
                {manageable && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      title="Передать владение"
                      aria-label={`Передать владение ${m.name}`}
                      onClick={() => setPending({ kind: "transfer", userId: m.id, name: m.name })}
                      className="size-9 rounded-lg grid place-items-center text-muted-foreground hover:text-amber-500 hover:bg-accent transition-colors"
                    >
                      <Crown className="size-4" />
                    </button>
                    <button
                      type="button"
                      title="Исключить из поездки"
                      aria-label={`Исключить ${m.name}`}
                      onClick={() => setPending({ kind: "remove", userId: m.id, name: m.name })}
                      className="size-9 rounded-lg grid place-items-center text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                    >
                      <UserMinus className="size-4" />
                    </button>
                    <button
                      type="button"
                      title="Заблокировать в поездке"
                      aria-label={`Заблокировать ${m.name}`}
                      onClick={() => setPending({ kind: "ban", userId: m.id, name: m.name })}
                      className="size-9 rounded-lg grid place-items-center text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                    >
                      <Ban className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {isOwner && others.length > 0 && (
          <p className="text-[10px] text-muted-foreground leading-snug">
            Заблокированный не сможет вернуться по ссылке-приглашению. Участник получит уведомление.
          </p>
        )}
      </div>

      {isOwner && bans && bans.length > 0 && (
        <div className="rounded-2xl border border-destructive/20 p-3 space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">
            Заблокированные
          </span>
          {bans.map((b) => (
            <div key={b.id} className="flex items-center gap-2.5">
              <span
                className="size-8 rounded-full grid place-items-center text-sm border-2 border-card shrink-0 opacity-80"
                style={{ background: b.user.color }}
              >
                {b.user.emoji}
              </span>
              <span className="text-xs font-medium truncate flex-1 min-w-0">{b.user.name}</span>
              <button
                type="button"
                onClick={() =>
                  memberAction.mutate({
                    url: `/api/participants/ban?tripId=${tripId}&userId=${b.user.id}`,
                    method: "DELETE",
                  })
                }
                className="min-h-9 px-2.5 rounded-lg bg-secondary border border-border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-accent transition-colors"
              >
                <ShieldCheck className="size-3.5" />
                Разблокировать
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Подтверждение */}
      <AlertDialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          {pending?.kind === "remove" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Исключить {pending.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Участник потеряет доступ к поездке и получит уведомление. Его траты останутся в истории бюджета.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="mt-0 rounded-xl">Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    memberAction.mutate({ url: `/api/participants/${pending.userId}?tripId=${tripId}`, method: "DELETE" });
                  }}
                  className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
                >
                  Исключить
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {pending?.kind === "ban" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Заблокировать {pending.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Участник будет исключён и не сможет вернуться по ссылке или коду приглашения — полезно, если ссылка
                  утекла. Получит уведомление.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="mt-0 rounded-xl">Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    memberAction.mutate({
                      url: "/api/participants/ban",
                      method: "POST",
                      body: { tripId, userId: pending.userId, reason: "Заблокирован владельцем" },
                    });
                  }}
                  className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
                >
                  Заблокировать
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {pending?.kind === "transfer" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Передать владение {pending.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Ты станешь обычным участником, а {pending.name} — владельцем: сможет управлять составом и приглашать.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="mt-0 rounded-xl">Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    memberAction.mutate({
                      url: `/api/trips/${tripId}/members/${pending.userId}`,
                      method: "PATCH",
                      body: { role: "owner" },
                    });
                  }}
                  className="rounded-xl"
                >
                  Передать владение
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
