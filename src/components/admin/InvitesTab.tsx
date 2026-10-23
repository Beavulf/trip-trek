"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2, Plus, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

// Инвайт-коды приложения: генерация пачки и слежение за активациями.
// Код проверяется на регистрации аккаунта (не на входе в поездку).

interface InviteRow {
  id: string;
  code: string;
  note: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
}

const inputCls =
  "w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm input-mobile";

function statusMeta(row: InviteRow): { label: string; cls: string } {
  if (row.deactivatedAt) return { label: "Выключен", cls: "bg-muted text-muted-foreground" };
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now())
    return { label: "Истёк", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
  if (row.usedCount >= row.maxUses)
    return { label: "Мест нет", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" };
  return { label: "Активен", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
}

export function InvitesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ codes: InviteRow[] }>({
    queryKey: ["admin-invites"],
    queryFn: async () => {
      const r = await fetch("/api/admin/invites");
      if (!r.ok) throw new Error("Не удалось загрузить коды");
      return r.json();
    },
  });

  const [count, setCount] = useState("10");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-invites"] });
    qc.invalidateQueries({ queryKey: ["admin-journal"] });
  };

  const generate = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: Number(count),
          maxUses: Number(maxUses),
          expiresAt: expiresAt || undefined,
          note: note || undefined,
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `Ошибка ${r.status}`);
      return b as { codes: string[] };
    },
    onSuccess: (b) => {
      invalidate();
      setNote("");
      toast.success(`Создано кодов: ${b.codes.length}`, {
        description: b.codes.join("  "),
        duration: 10000,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (row: InviteRow) => {
      const r = await fetch(`/api/admin/invites/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deactivatedAt: !row.deactivatedAt }),
      });
      if (!r.ok) throw new Error(`Ошибка ${r.status}`);
      return r.json();
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast.success(`Скопировано: ${code}`);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* === Генерация === */}
      <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Ticket className="size-4 text-teal-500" />
          <h2 className="font-semibold text-sm">Сгенерировать коды</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Сколько кодов (1–100)</span>
            <input type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} className={inputCls} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Активаций на код (1–1000)</span>
            <input type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={inputCls} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Действует до (необязательно)</span>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Заметка (для себя)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="тикток-видео" className={inputCls} />
          </label>
        </div>
        <button
          type="button"
          disabled={generate.isPending}
          onClick={() => generate.mutate()}
          className="w-full min-h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
        >
          {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Создать коды
        </button>
        <p className="text-[10px] text-muted-foreground">
          Общий код на кампанию — например 1 код на 100 активаций. Персональные — 100 кодов по 1 активации.
        </p>
      </section>

      {/* === Список === */}
      <section className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
        {(data?.codes ?? []).map((row) => {
          const st = statusMeta(row);
          return (
            <div key={row.id} className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => copy(row.code)}
                title="Скопировать код"
                className="font-mono font-bold text-sm tracking-wider hover:text-primary transition-colors inline-flex items-center gap-1.5"
              >
                {row.code}
                <Copy className="size-3 opacity-50" />
              </button>
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", st.cls)}>{st.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {row.usedCount}/{row.maxUses}
              </span>
              <span className="text-xs text-muted-foreground truncate flex-1 min-w-0" title={row.note ?? undefined}>
                {row.note ?? ""}
                {row.expiresAt && ` · до ${new Date(row.expiresAt).toLocaleDateString("ru-RU")}`}
              </span>
              <Switch
                checked={!row.deactivatedAt}
                onCheckedChange={() => toggle.mutate(row)}
                disabled={toggle.isPending}
                aria-label="Код активен"
              />
            </div>
          );
        })}
        {(data?.codes ?? []).length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Кодов ещё нет — сгенерируйте первую партию выше.
          </p>
        )}
      </section>
    </div>
  );
}
