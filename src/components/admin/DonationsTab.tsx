"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Heart, Loader2, PlugZap, Trash2, Unlink, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/split/money";
import { UserAvatar } from "@/components/trip/user-avatar";
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
import { EmptyState, SECTION_COLOR, Stamp, fmtDateTime, relTime } from "./shared";

// Вкладка «Донаты» (ADR-0011): лента поступлений из DonationAlerts + привязка к юзерам.
// Токен задаётся в Настройках → Поддержка; статус WS-клиента виден здесь же.

interface DonationRow {
  id: string;
  source: string;
  donaterName: string | null;
  daUsername: string | null;
  message: string | null;
  amountCents: number;
  currency: string;
  donatedAt: string;
  matchedUserId: string | null;
  matchedBy: string | null;
  user: { id: string; name: string; emoji: string; color: string; avatarUrl: string | null } | null;
}

interface DonationTotals {
  currency: string;
  count: number;
  amountCents: number;
}

interface ClientStatus {
  state: "off" | "connecting" | "connected" | "error";
  daAccount?: string;
  lastEventAt?: string;
  lastError?: string;
}

interface DonationsData {
  donations: DonationRow[];
  totals: DonationTotals[];
  unmatched: number;
  client: ClientStatus;
}

const STATE_META: Record<ClientStatus["state"], { label: string; dot: string; text: string }> = {
  connected: { label: "на связи", dot: "bg-emerald-500", text: "text-emerald-600" },
  connecting: { label: "подключается…", dot: "bg-amber-500 animate-pulse", text: "text-amber-600" },
  error: { label: "ошибка", dot: "bg-rose-500", text: "text-rose-600" },
  off: { label: "токен не задан", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};

const PICK_LIMIT = 6;

/** Инлайн-поиск юзера для привязки: тот же GET /api/admin/users?q=, что и в «Юзерах». */
function UserPicker({ onPick, onCancel }: { onPick: (userId: string) => void; onCancel: () => void }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data: users, isFetching } = useQuery({
    queryKey: ["admin-users", q],
    enabled: q.length > 0,
    queryFn: async () => {
      const r = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error("fetch users failed");
      return r.json() as Promise<{ id: string; name: string; email: string; emoji: string; color: string; avatarUrl: string | null }[]>;
    },
    staleTime: 15_000,
  });

  return (
    <div className="w-full rounded-xl border border-border bg-background/50 p-2 space-y-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ник или email юзера…"
          className="flex-1 bg-transparent text-sm outline-none min-h-9 px-2"
        />
        {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-accent">
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>
      {(users ?? []).slice(0, PICK_LIMIT).map((u) => (
        <button
          key={u.id}
          type="button"
          onClick={() => onPick(u.id)}
          className="w-full flex items-center gap-2.5 p-2 rounded-lg text-left hover:bg-accent/60 transition-colors"
        >
          <UserAvatar name={u.name} emoji={u.emoji} color={u.color} avatarUrl={u.avatarUrl} className="size-7 text-xs" />
          <span className="text-sm font-medium truncate">{u.name}</span>
          <span className="text-xs text-muted-foreground truncate">{u.email}</span>
        </button>
      ))}
      {q.length > 0 && users && users.length === 0 && (
        <p className="text-xs text-muted-foreground px-2 pb-1">Никого не нашли</p>
      )}
    </div>
  );
}

export function DonationsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unmatched">("all");
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<DonationsData>({
    queryKey: ["admin-donations"],
    queryFn: async () => {
      const r = await fetch("/api/admin/donations");
      if (!r.ok) throw new Error("fetch donations failed");
      return r.json();
    },
    staleTime: 15_000,
    refetchInterval: 60_000, // статус клиента и лента обновляются сами
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-donations"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-journal"] });
  };

  const link = useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string | null }) => {
      const r = await fetch("/api/admin/donations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, userId }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось привязать");
    },
    onSuccess: (_res, vars) => {
      setPickingId(null);
      invalidate();
      toast.success(vars.userId === null ? "Донат отвязан" : "Донат привязан — юзеру засветится бейдж");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/admin/donations?id=${id}`, { method: "DELETE" });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось удалить");
    },
    onSuccess: () => {
      setDeleteId(null);
      invalidate();
      toast.success("Донат удалён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-connection" }),
      });
      return r.json() as Promise<{ ok: boolean; account?: string; error?: string }>;
    },
    onSuccess: (res) => {
      if (res.ok) toast.success(`Связь есть: ${res.account}`);
      else toast.error(`Не вышло: ${res.error}`);
      invalidate();
    },
  });

  const simulate = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "simulate" }),
      });
      return r.json() as Promise<{ result?: string }>;
    },
    onSuccess: (res) => {
      toast.success(res.result === "new" ? "Тестовый донат создан — проверьте колокольчик" : "Такой донат уже был");
      invalidate();
    },
  });

  const donations = (data?.donations ?? []).filter((d) => (filter === "unmatched" ? !d.matchedUserId : true));
  const stateMeta = STATE_META[data?.client.state ?? "off"];
  const deletedDonation = data?.donations.find((d) => d.id === deleteId);

  return (
    <div className="space-y-4">
      {/* Итоги + статус клиента */}
      <div className="flex flex-wrap items-stretch gap-2">
        {(data?.totals ?? []).map((t) => (
          <div key={t.currency} className="rounded-2xl bg-card border border-border px-4 py-2.5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t.currency}</div>
            <div className="text-lg font-bold" style={{ color: SECTION_COLOR.donations }}>
              {formatCents(t.amountCents, t.currency)}
            </div>
            <div className="text-xs text-muted-foreground">{t.count} донат(ов)</div>
          </div>
        ))}
        <div className="rounded-2xl bg-card border border-border px-4 py-2.5 flex flex-col justify-center min-w-44">
          <div className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", stateMeta.dot)} />
            <span className={cn("text-xs font-medium", stateMeta.text)}>
              DonationAlerts: {stateMeta.label}
            </span>
          </div>
          {data?.client.daAccount && <div className="text-xs text-muted-foreground truncate">{data.client.daAccount}</div>}
          {data?.client.lastError && <div className="text-[11px] text-rose-500/80 truncate">{data.client.lastError}</div>}
        </div>
        <div className="flex gap-2 items-center ml-auto">
          <button
            type="button"
            onClick={() => test.mutate()}
            disabled={test.isPending}
            className="flex items-center gap-1.5 px-3 min-h-9 rounded-xl border border-border text-sm font-medium hover:bg-accent/60 transition-colors disabled:opacity-50"
          >
            {test.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
            Проверить связь
          </button>
          <button
            type="button"
            onClick={() => simulate.mutate()}
            disabled={simulate.isPending}
            className="flex items-center gap-1.5 px-3 min-h-9 rounded-xl text-sm font-medium text-primary-foreground transition-colors disabled:opacity-50"
            style={{ backgroundColor: SECTION_COLOR.donations }}
          >
            {simulate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Heart className="size-4" />}
            Тестовый донат
          </button>
        </div>
      </div>

      {/* Фильтр */}
      <div className="flex gap-1.5">
        {([
          { value: "all", label: "Все" },
          { value: "unmatched", label: `Непривязанные${data?.unmatched ? ` · ${data.unmatched}` : ""}` },
        ] as const).map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-3 min-h-8 rounded-full text-xs font-medium transition-colors",
              filter === f.value ? "text-primary-foreground bg-primary" : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Лента */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : donations.length === 0 ? (
        <EmptyState
          emoji="❤️"
          title={filter === "unmatched" ? "Непривязанных донатов нет" : "Донатов пока нет"}
          hint={
            filter === "all"
              ? "Задайте OAuth-токен в Настройках → Поддержка — донаты появятся здесь автоматически"
              : "Привяжите донаты к юзерам, чтобы у них зажёгся бейдж"
          }
        />
      ) : (
        <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
          {donations.map((d, i) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.2) }}
              className="p-3 space-y-2"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: SECTION_COLOR.donations }}>
                      {formatCents(d.amountCents, d.currency)}
                    </span>
                    <span className="text-sm font-medium truncate">{d.donaterName || "Аноним"}</span>
                    {d.source === "test" && <Stamp label="тест" color="#94a3b8" />}
                    {d.matchedBy === "auto" && <Stamp label="авто" color="#10b981" />}
                  </div>
                  {d.message && <div className="text-xs text-muted-foreground italic truncate">«{d.message}»</div>}
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-0.5">
                    {relTime(d.donatedAt)} · {fmtDateTime(d.donatedAt)}
                    {d.daUsername ? ` · DA: ${d.daUsername}` : ""}
                  </div>
                </div>

                {/* Юзер: чип или кнопки привязки/удаления */}
                {d.user ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-2 rounded-xl border border-border px-2 py-1">
                      <UserAvatar name={d.user.name} emoji={d.user.emoji} color={d.user.color} avatarUrl={d.user.avatarUrl} className="size-6 text-[10px]" />
                      <span className="text-xs font-medium">{d.user.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => link.mutate({ id: d.id, userId: null })}
                      title="Отвязать"
                      className="p-2 rounded-lg text-muted-foreground hover:bg-accent/60 transition-colors"
                    >
                      <Unlink className="size-4" />
                    </button>
                  </div>
                ) : pickingId === d.id ? (
                  <UserPicker
                    onPick={(userId) => link.mutate({ id: d.id, userId })}
                    onCancel={() => setPickingId(null)}
                  />
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPickingId(d.id)}
                      className="flex items-center gap-1.5 px-2.5 min-h-8 rounded-lg border border-border text-xs font-medium hover:bg-accent/60 transition-colors"
                    >
                      <UserPlus className="size-3.5" />
                      Привязать
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(d.id)}
                      title="Удалить донат"
                      className="p-2 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-accent/60 transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Подтверждение удаления */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить донат?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletedDonation
                ? `${deletedDonation.donaterName || "Аноним"} · ${formatCents(deletedDonation.amountCents, deletedDonation.currency)}. Юзер потеряет бейдж, если это был его единственный донат.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && remove.mutate(deleteId)}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
