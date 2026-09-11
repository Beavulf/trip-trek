"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Crown,
  KeyRound,
  Loader2,
  Pencil,
  Search,
  ShieldOff,
  ShieldCheck,
  Trash2,
  UserRoundSearch,
} from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { UserAvatar } from "@/components/trip/user-avatar";
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
import { EmptyState, Stamp, TripStatusStamp } from "./shared";

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

interface AdminUserDetail extends AdminUserRow {
  memberships: {
    id: string;
    role: string;
    displayName: string;
    joinedAt: string;
    trip: {
      id: string;
      title: string;
      status: string;
      coverEmoji: string;
      coverColor: string;
      _count: { members: number; expenses: number };
    };
  }[];
  _count: { memberships: number; photos: number; expenses: number; journals: number; feedback: number };
}

const DEMOTE_COLOR = "#ef4444";
const FILTERS = [
  { value: "all", label: "Все" },
  { value: "premium", label: "Premium" },
  { value: "admin", label: "Админы" },
] as const;

/** Стартовый ?q= из адресной строки (ссылки «новые аккаунты» с Обзора).
 * Ленивый инициализатор: дети шелла не рендерятся на SSR (гейт по сессии),
 * поэтому рассинхрона гидратации не бывает. */
function initialQ(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q")?.trim() || "";
}

export function UsersTab({ selfId }: { selfId: string }) {
  const [input, setInput] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const visible = useMemo(() => {
    if (!users) return [];
    if (filter === "premium") return users.filter((u) => u.plan === "premium");
    if (filter === "admin") return users.filter((u) => u.role === "admin");
    return users;
  }, [users, filter]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-journal"] });
  };

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
    onSuccess: (_updated, vars) => {
      if (selectedId) qc.invalidateQueries({ queryKey: ["admin-user", selectedId] });
      invalidate();
      toast.success("Сохранено");
      // не таскаем пароль в invalidation-кэш — просто очищается форма
      if (vars && typeof vars === "object" && "password" in vars) return;
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
      setSelectedId(null);
      invalidate();
      toast.success("Пользователь удалён");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      {/* Поиск + фильтры */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Имя или email…"
            className="w-full min-h-11 rounded-2xl border border-border bg-card pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 input-mobile"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar chip-snap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-3 min-h-9 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Список / таблица */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : !visible.length ? (
        <EmptyState
          emoji="🗂️"
          title={q || filter !== "all" ? "Никого не нашли по этим условиям" : "Пользователей пока нет"}
        />
      ) : (
        <>
          {/* Мобильные карточки */}
          <div className="lg:hidden rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
            {visible.map((u, i) => (
              <motion.button
                key={u.id}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                onClick={() => setSelectedId(u.id)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
              >
                <UserAvatar name={u.name} emoji={u.emoji} color={u.color} avatarUrl={u.avatarUrl} className="size-10 text-base border-2 border-background" />
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

          {/* Таблица на ПК */}
          <div className="hidden lg:block rounded-2xl bg-card border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  {["Пользователь", "План", "Поездки", "Регистрация"].map((h, i) => (
                    <th
                      key={i}
                      className={cn(
                        "px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground",
                        (h === "Поездки" || h === "Регистрация") && "text-right"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedId(u.id)}
                    className="cursor-pointer hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar name={u.name} emoji={u.emoji} color={u.color} avatarUrl={u.avatarUrl} className="size-9 text-base" />
                        <div className="min-w-0">
                          <div className="font-medium truncate flex items-center gap-1.5">
                            <span className="truncate">{u.name}</span>
                            {u.role === "admin" && <Stamp label="Админ" color={DEMOTE_COLOR} />}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.plan === "premium" ? (
                        <span className="inline-flex items-center gap-1 text-amber-500 font-medium text-xs">
                          <Crown className="size-3.5" />
                          {u.planExpiry ? `до ${new Date(u.planExpiry).toLocaleDateString("ru-RU")}` : "бессрочно"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Free</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{u._count.memberships}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Карточка пользователя */}
      <UserDetailSheet
        userId={selectedId}
        selfId={selfId}
        onClose={() => setSelectedId(null)}
        patch={patch}
        onDelete={() => selectedId && remove.mutate(selectedId)}
      />
    </>
  );
}

function UserDetailSheet({
  userId,
  selfId,
  onClose,
  patch,
  onDelete,
}: {
  userId: string | null;
  selfId: string;
  onClose: () => void;
  patch: ReturnType<typeof useMutation<AdminUserRow, Error, Record<string, unknown>>>;
  onDelete: () => void;
}) {
  const [confirmRole, setConfirmRole] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState(false);

  const { data: user } = useQuery<AdminUserDetail>({
    queryKey: ["admin-user", userId],
    queryFn: async () => {
      const r = await fetch(`/api/admin/users?id=${userId}`);
      if (!r.ok) throw new Error("fetch user failed");
      return r.json();
    },
    enabled: !!userId,
  });

  // Форма синхронизируется при смене юзера И после сохранения (когда данные
  // с сервера приходят обновлённые) — паттерн «пересборка стейта при смене пропсы»
  const [form, setForm] = useState({ name: "", email: "", emoji: "", color: "" });
  const [password, setPassword] = useState("");
  const [days, setDays] = useState(30);
  const [syncKey, setSyncKey] = useState("");

  const currentKey = user ? `${user.id}:${user.name}:${user.email}:${user.emoji}:${user.color}` : "";
  if (user && currentKey !== syncKey) {
    setSyncKey(currentKey);
    setForm({ name: user.name, email: user.email, emoji: user.emoji, color: user.color });
    setPassword("");
    setDays(30);
  }

  if (!userId || !user) return null;

  const isPremium = user.plan === "premium";
  const isAdmin = user.role === "admin";
  const isSelf = user.id === selfId;
  const busy = patch.isPending;

  const passwordValid = password.length >= 8 && /[a-z]/i.test(password) && /\d/.test(password);

  const saveProfile = () =>
    patch.mutate({
      id: user.id,
      ...(form.name !== user.name ? { name: form.name } : {}),
      ...(form.email !== user.email ? { email: form.email } : {}),
      ...(form.emoji !== user.emoji ? { emoji: form.emoji } : {}),
      ...(form.color !== user.color ? { color: form.color } : {}),
    });

  return (
    <MobileBottomSheet open={!!userId} onOpenChange={(v) => !v && onClose()} title="Профиль" titleIcon={<UserRoundSearch className="size-4" />}>
      <div className="space-y-4">
        {/* Паспортные данные */}
        <div className="flex items-center gap-3">
          <UserAvatar name={user.name} emoji={user.emoji} color={user.color} avatarUrl={user.avatarUrl} className="size-14 text-2xl" />
          <div className="min-w-0">
            <div className="font-bold flex items-center gap-2">
              <span className="truncate">{user.name}</span>
              {isAdmin && <Stamp label="Админ" color={DEMOTE_COLOR} />}
              {isPremium && <Crown className="size-4 text-amber-500 shrink-0" />}
            </div>
            <div className="text-sm text-muted-foreground truncate">{user.email}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-0.5">
              с {new Date(user.createdAt).toLocaleDateString("ru-RU")} · {isPremium
                ? user.planExpiry
                  ? `premium до ${new Date(user.planExpiry).toLocaleDateString("ru-RU")}`
                  : "premium бессрочно"
                : "free"}
            </div>
          </div>
        </div>

        {/* Вклад в контент */}
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { label: "поездки", value: user._count.memberships },
            { label: "фото", value: user._count.photos },
            { label: "траты", value: user._count.expenses },
            { label: "дневники", value: user._count.journals },
            { label: "отзывы", value: user._count.feedback },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-secondary/50 px-1.5 py-2 text-center">
              <div className="text-lg font-black tabular-nums leading-none">{s.value}</div>
              <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/70 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Поездки */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1.5">поездки</p>
          {user.memberships.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">Пока не состоит ни в одной поездке</p>
          ) : (
            <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
              {user.memberships.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="size-9 rounded-xl grid place-items-center text-lg shrink-0" style={{ background: `${m.trip.coverColor}22` }}>
                    {m.trip.coverEmoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      <span className="truncate">{m.trip.title}</span>
                      <TripStatusStamp status={m.trip.status} />
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                      {m.role === "owner" ? "владелец" : "участник"} · {m.trip._count.members} уч. · с{" "}
                      {new Date(m.joinedAt).toLocaleDateString("ru-RU")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Редактирование профиля */}
        <div className="rounded-2xl border border-border p-3.5 space-y-2.5">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Pencil className="size-3.5 text-muted-foreground" />
            Редактировать профиль
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Имя</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm input-mobile"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Email</span>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm input-mobile"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Эмодзи</span>
              <input
                value={form.emoji}
                onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                className="w-full min-h-10 rounded-xl border border-input bg-background px-3 text-sm input-mobile"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Цвет</span>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="size-10 rounded-xl border border-input bg-background p-1 cursor-pointer"
                  aria-label="Цвет аватара"
                />
                <input
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="flex-1 min-h-10 rounded-xl border border-input bg-background px-3 text-sm font-mono input-mobile"
                />
              </div>
            </label>
          </div>
          <button
            type="button"
            disabled={busy || (form.name === user.name && form.email === user.email && form.emoji === user.emoji && form.color === user.color)}
            onClick={saveProfile}
            className="w-full min-h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            Сохранить профиль
          </button>
        </div>

        {/* Сброс пароля */}
        <div className="rounded-2xl border border-border p-3.5 space-y-2.5">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <KeyRound className="size-3.5 text-muted-foreground" />
            Сбросить пароль
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Задай новый пароль для входа. Минимум 8 символов, буквы и цифры.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="новый пароль…"
              autoComplete="off"
              className="flex-1 min-h-10 rounded-xl border border-input bg-background px-3 text-sm font-mono input-mobile"
            />
            <button
              type="button"
              disabled={!passwordValid || busy}
              onClick={() => setConfirmPassword(true)}
              className="min-h-10 px-4 rounded-xl bg-secondary border border-border text-sm font-medium disabled:opacity-40 whitespace-nowrap"
            >
              Задать
            </button>
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
              {isPremium ? (user.planExpiry ? `до ${new Date(user.planExpiry).toLocaleDateString("ru-RU")}` : "бессрочно") : "Free"}
            </span>
          </div>
          {isPremium ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => patch.mutate({ id: user.id, plan: "free" })}
              className="w-full min-h-10 rounded-xl bg-secondary border border-border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
            >
              Снять Premium
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => patch.mutate({ id: user.id, plan: "premium", premiumDays: null })}
                className="flex-1 min-h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98]"
              >
                Бессрочно
              </button>
              <div className="flex gap-1.5 flex-1">
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={days}
                  onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
                  className="w-16 min-h-10 rounded-xl border border-input bg-background px-2.5 text-sm text-center input-mobile"
                  aria-label="Дней premium"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => patch.mutate({ id: user.id, plan: "premium", premiumDays: days })}
                  className="flex-1 min-h-10 rounded-xl bg-secondary border border-border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  На {days} дн
                </button>
              </div>
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
                patch.mutate({ id: user.id, role: isAdmin ? "user" : "admin" });
              }}
              className="rounded-xl"
            >
              Подтвердить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Подтверждение пароля */}
      <AlertDialog open={confirmPassword} onOpenChange={setConfirmPassword}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Задать новый пароль?</AlertDialogTitle>
            <AlertDialogDescription>
              {user.name} сможет войти только с новым паролем. Сообщи его пользователю лично — панель не отправляет писем.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmPassword(false);
                patch.mutate({ id: user.id, password }, { onSettled: () => setPassword("") });
              }}
              className="rounded-xl"
            >
              Задать пароль
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
