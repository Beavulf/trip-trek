"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronRight, Crown, Loader2, Search, ShieldOff, ShieldCheck, Trash2, UserRoundSearch } from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
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
import { Stamp } from "./shared";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  emoji: string;
  color: string;
  avatarUrl: string | null;
  plan: string;
  planExpiry: string | null;
  role: string;
  createdAt: string;
  _count: { memberships: number };
}

const DEMOTE_COLOR = "#ef4444";

function Avatar({ user, size = "size-10" }: { user: AdminUserRow; size?: string }) {
  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatarUrl} alt="" className={cn(size, "rounded-full object-cover border-2 border-background shrink-0")} />
  ) : (
    <span
      className={cn(size, "rounded-full grid place-items-center text-base border-2 border-background shrink-0")}
      style={{ background: user.color }}
    >
      {user.emoji}
    </span>
  );
}

export function UsersTab({ selfId }: { selfId: string }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data: users, isLoading } = useQuery<AdminUserRow[]>({
    queryKey: ["admin-users", q],
    queryFn: async () => {
      const r = await fetch(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (!r.ok) throw new Error("fetch users failed");
      return r.json();
    },
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось сохранить");
      return json as AdminUserRow;
    },
    onSuccess: (updated) => {
      setSelected(updated);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Сохранено");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || "Не удалось удалить");
    },
    onSuccess: () => {
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Пользователь удалён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      {/* Поиск */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Имя или email…"
          className="w-full min-h-11 rounded-2xl border border-border bg-card pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 input-mobile"
        />
      </div>

      {/* Список */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : !users?.length ? (
        <div className="py-16 text-center space-y-2">
          <div className="text-4xl">🗂️</div>
          <p className="text-sm text-muted-foreground">
            {q ? "Никого не нашли по запросу" : "Пользователей пока нет"}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
          {users.map((u, i) => (
            <motion.button
              key={u.id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              onClick={() => setSelected(u)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
            >
              <Avatar user={u} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{u.name}</span>
                  {u.role === "admin" && <Stamp label="Админ" color={DEMOTE_COLOR} />}
                </div>
                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-0.5">
                  {new Date(u.createdAt).toLocaleDateString("ru-RU")} · {u._count.memberships}{" "}
                  {plural(u._count.memberships, "поездка", "поездки", "поездок")}
                </div>
              </div>
              {u.plan === "premium" && <Crown className="size-4 text-amber-500 shrink-0" />}
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </motion.button>
          ))}
        </div>
      )}

      {/* Карточка пользователя */}
      <UserDetailSheet
        user={selected}
        selfId={selfId}
        onClose={() => setSelected(null)}
        busy={patch.isPending || remove.isPending}
        onGrant={(days: number | null) => patch.mutate({ id: selected!.id, plan: "premium", premiumDays: days })}
        onRevokePremium={() => patch.mutate({ id: selected!.id, plan: "free" })}
        onSetRole={(role: "user" | "admin") => patch.mutate({ id: selected!.id, role })}
        onDelete={() => remove.mutate(selected!.id)}
      />
    </>
  );
}

function UserDetailSheet({
  user,
  selfId,
  onClose,
  busy,
  onGrant,
  onRevokePremium,
  onSetRole,
  onDelete,
}: {
  user: AdminUserRow | null;
  selfId: string;
  onClose: () => void;
  busy: boolean;
  onGrant: (days: number | null) => void;
  onRevokePremium: () => void;
  onSetRole: (role: "user" | "admin") => void;
  onDelete: () => void;
}) {
  const [confirmRole, setConfirmRole] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!user) return null;

  const isPremium = user.plan === "premium";
  const isAdmin = user.role === "admin";
  const isSelf = user.id === selfId;

  return (
    <MobileBottomSheet open={!!user} onOpenChange={(v) => !v && onClose()} title="Профиль" titleIcon={<UserRoundSearch className="size-4" />}>
      <div className="space-y-4">
        {/* Паспортные данные */}
        <div className="flex items-center gap-3">
          <Avatar user={user} size="size-14" />
          <div className="min-w-0">
            <div className="font-bold flex items-center gap-2">
              <span className="truncate">{user.name}</span>
              {isAdmin && <Stamp label="Админ" color={DEMOTE_COLOR} />}
            </div>
            <div className="text-sm text-muted-foreground truncate">{user.email}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-0.5">
              с {new Date(user.createdAt).toLocaleDateString("ru-RU")} · {user._count.memberships}{" "}
              {plural(user._count.memberships, "поездка", "поездки", "поездок")}
            </div>
          </div>
        </div>

        {/* Premium */}
        <div className="rounded-2xl border border-border p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold inline-flex items-center gap-1.5">
              <Crown className={cn("size-4", isPremium ? "text-amber-500" : "text-muted-foreground")} />
              Подписка
            </span>
            <span className={cn("text-xs", isPremium ? "text-amber-500 font-semibold" : "text-muted-foreground")}>
              {isPremium
                ? user.planExpiry
                  ? `до ${new Date(user.planExpiry).toLocaleDateString("ru-RU")}`
                  : "бессрочно"
                : "Free"}
            </span>
          </div>
          {isPremium ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRevokePremium}
              className="w-full min-h-10 rounded-xl bg-secondary border border-border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
            >
              Снять Premium
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onGrant(null)}
                className="min-h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98]"
              >
                Выдать бессрочно
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onGrant(30)}
                className="min-h-10 rounded-xl bg-secondary border border-border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                На 30 дней
              </button>
            </div>
          )}
        </div>

        {/* Роль */}
        {!isSelf && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmRole(true)}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-border hover:bg-accent/50 transition-colors text-left disabled:opacity-50"
          >
            <span className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
              {isAdmin ? <ShieldOff className="size-4.5 text-destructive" /> : <ShieldCheck className="size-4.5 text-muted-foreground" />}
            </span>
            <span className="flex-1 text-sm font-medium">{isAdmin ? "Снять права админа" : "Назначить админом"}</span>
          </button>
        )}

        {/* Опасная зона */}
        {!isSelf && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="w-full min-h-12 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 font-medium flex items-center justify-center gap-2 hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            <Trash2 className="size-4" />
            Удалить пользователя
          </button>
        )}
      </div>

      {/* Подтверждение смены роли */}
      <AlertDialog open={confirmRole} onOpenChange={setConfirmRole}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{isAdmin ? "Снять права админа?" : "Назначить админом?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAdmin
                ? `${user.name} потеряет доступ к админ-панели.`
                : `${user.name} получит доступ ко всем данным приложения: пользователям, поездкам и отзывам.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmRole(false);
                onSetRole(isAdmin ? "user" : "admin");
              }}
              className="rounded-xl"
            >
              Подтвердить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Подтверждение удаления */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Аккаунт и его участие в поездках исчезнут безвозвратно. Если пользователь платил в общих тратах,
              удаление будет заблокировано — балансы нельзя ломать.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 rounded-xl">Оставить</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmDelete(false);
                onDelete();
              }}
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileBottomSheet>
  );
}
