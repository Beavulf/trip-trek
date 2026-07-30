"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth as useSession } from "@/hooks/use-auth";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ChevronLeft,
  Crown,
  Camera,
  Check,
  Loader2,
  LogOut,
  Moon,
  Sun,
  Bell,
  Info,
  Plane,
  Images,
  Wallet,
  BookOpen,
  MessagesSquare,
  MapPin,
  Trophy,
  Settings,
  Sparkles,
  X,
  ArrowRight,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PremiumModal } from "@/components/trip/premium-modal";
import { getTripId, setTripId } from "@/hooks/use-trip";

interface UserProfile {
  id: string;
  email: string;
  name: string;
  emoji: string;
  color: string;
  plan: string;
  planExpiry: string | null;
  createdAt: string;
  isPremium: boolean;
  stats: {
    trips: number;
    ownedTrips: number;
    photos: number;
    totalSpent: number;
    journals: number;
    messages: number;
    visitedPlaces: number;
  };
  limits: {
    maxOwnedTrips: number | null;
    maxMembersPerTrip: number | null;
    canCreateTrip: boolean;
  };
  trips: TripInfo[];
  achievements: { emoji: string; label: string; req: string; unlocked: boolean }[];
}

interface TripInfo {
  id: string;
  title: string;
  destination: string;
  coverColor: string;
  coverEmoji: string;
  startDate: string;
  endDate: string | null;
  totalDays: number;
  status: string;
  inviteCode: string;
  role: string;
  members: number;
  places: number;
  photos: number;
  expenses: number;
  journals: number;
}

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👤");
  const [color, setColor] = useState("#94a3b8");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const userId = (session?.user as { id?: string } | undefined)?.id || "";

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const r = await fetch(`/api/user?userId=${userId}`);
      if (!r.ok) throw new Error("fetch profile");
      return r.json();
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setEmoji(profile.emoji);
      setColor(profile.color);
    }
  }, [profile]);

  // Редирект только если ТОЧНО не авторизован (не на loading/error)
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, name, emoji, color }),
      });
      if (!r.ok) throw new Error("update failed");
      toast.success("Профиль обновлён ✨");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["user-profile"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    } catch {
      toast.error("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/custom-signout", { method: "POST" });
      window.location.assign("/login");
    } catch {
      window.location.assign("/login");
    } finally {
      setSigningOut(false);
    }
  };

  const openTrip = (tripId: string) => {
    setTripId(tripId);
    qc.invalidateQueries({ queryKey: ["trip"] });
    qc.invalidateQueries({ queryKey: ["days"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["photos"] });
    qc.invalidateQueries({ queryKey: ["journal"] });
    qc.invalidateQueries({ queryKey: ["board"] });
    qc.invalidateQueries({ queryKey: ["checklist"] });
    qc.invalidateQueries({ queryKey: ["info"] });
    qc.invalidateQueries({ queryKey: ["phrases"] });
    qc.invalidateQueries({ queryKey: ["foods"] });
    qc.invalidateQueries({ queryKey: ["budget-plan"] });
    router.push("/");
  };

  // Пока сессия грузится — показываем спиннер (не редиректим!)
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Если точно не авторизован — редирект (через useEffect выше)
  if (status === "unauthenticated" || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const EMOJIS = ["👤", "🧑", "👨", "👩", "🧔", "👱", "👲", "👳", "🧑‍🦰", "👨‍🦳", "👩‍🦰", "🧑‍🎨", "😎", "🤓", "🥳", "🐱", "🐶", "🦊", "🐻", "🐼", "🐨", "🦁", "🐯", "🐸", "🐙", "🦄", "🌟", "🔥", "💎", "🌈"];
  const COLORS = ["#f97316", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#94a3b8", "#6366f1", "#14b8a6", "#e11d48"];

  const stats = [
    { icon: Plane, label: "Поездок", value: profile?.stats.trips ?? 0, color: "#06b6d4" },
    { icon: Images, label: "Фото", value: profile?.stats.photos ?? 0, color: "#8b5cf6" },
    { icon: Wallet, label: "Потрачено", value: `$${(profile?.stats.totalSpent ?? 0).toFixed(0)}`, color: "#10b981" },
    { icon: BookOpen, label: "Записей", value: profile?.stats.journals ?? 0, color: "#f59e0b" },
    { icon: MessagesSquare, label: "Сообщений", value: profile?.stats.messages ?? 0, color: "#ec4899" },
    { icon: MapPin, label: "Мест", value: profile?.stats.visitedPlaces ?? 0, color: "#ef4444" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Декоративный градиент */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(circle at 30% 0%, var(--primary) 0%, transparent 50%), radial-gradient(circle at 70% 100%, #8b5cf6 0%, transparent 50%)",
      }} />

      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b border-border/80">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="size-9 rounded-full grid place-items-center bg-secondary border border-border hover:bg-accent transition-colors"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="font-bold text-base">Профиль</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 pb-24 space-y-4 relative">
        {isLoading || !profile ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Профиль — аватар + имя */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative rounded-3xl overflow-hidden"
            >
              {/* Баннер */}
              <div
                className="h-24 sm:h-32 relative"
                style={{
                  background: `linear-gradient(135deg, ${profile.color}cc, ${profile.color}66)`,
                }}
              >
                <div className="absolute inset-0 opacity-20" style={{
                  backgroundImage: "radial-gradient(circle at 20% 50%, white 0%, transparent 40%), radial-gradient(circle at 80% 30%, white 0%, transparent 40%)",
                }} />
                {/* Premium бейдж в углу */}
                {profile.isPremium && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold shadow-lg">
                    <Crown className="size-3.5" /> Premium
                  </div>
                )}
              </div>

              {/* Аватар */}
              <div className="px-4 pb-4 -mt-12 relative">
                <div className="flex items-end gap-3">
                  <div
                    className="size-24 rounded-3xl grid place-items-center text-5xl shadow-xl border-4 border-background shrink-0 transition-transform"
                    style={{ background: profile.color }}
                  >
                    {editing ? (
                      <button
                        onClick={() => setEmoji(emoji === profile.emoji ? emoji : emoji)}
                        className="text-5xl"
                      >
                        {emoji}
                      </button>
                    ) : (
                      <span>{profile.emoji}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    {editing ? (
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full text-lg font-bold bg-transparent border-b border-primary outline-none pb-0.5"
                        placeholder="Имя"
                        autoFocus
                      />
                    ) : (
                      <h2 className="text-xl font-bold truncate">{profile.name}</h2>
                    )}
                    <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      С нами с {new Date(profile.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>

                {/* Кнопка редактировать / сохранить */}
                {editing ? (
                  <div className="mt-4 space-y-3">
                    {/* Эмодзи выбор */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Аватар</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {EMOJIS.map((e) => (
                          <button
                            key={e}
                            onClick={() => setEmoji(e)}
                            className={cn(
                              "size-10 rounded-xl text-xl grid place-items-center transition-all",
                              emoji === e ? "bg-primary/20 ring-2 ring-primary scale-110" : "bg-muted hover:bg-accent"
                            )}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Цвет выбор */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Цвет</label>
                      <div className="flex gap-2 flex-wrap">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setColor(c)}
                            className={cn(
                              "size-9 rounded-full transition-all",
                              color === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : "opacity-60 hover:opacity-100"
                            )}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </div>
                    {/* Кнопки */}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={saveProfile}
                        disabled={saving}
                        className="flex-1 rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        Сохранить
                      </button>
                      <button
                        onClick={() => {
                          setEditing(false);
                          setName(profile.name);
                          setEmoji(profile.emoji);
                          setColor(profile.color);
                        }}
                        className="px-4 rounded-xl bg-secondary border border-border py-3 font-medium"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setEditing(true)}
                      className="flex-1 rounded-xl bg-secondary border border-border py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors"
                    >
                      <Camera className="size-4" /> Редактировать
                    </button>
                    {!profile.isPremium && (
                      <button
                        onClick={() => setPremiumOpen(true)}
                        className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2.5 text-sm font-medium flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                      >
                        <Crown className="size-4" /> Premium
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Premium card — prominent */}
            {profile.isPremium ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 }}
                className="rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-2 border-amber-500/40 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 grid place-items-center shadow-lg shadow-amber-500/30">
                    <Crown className="size-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-base text-amber-600 dark:text-amber-400 flex items-center gap-2">
                      Premium активен 👑
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {profile.planExpiry
                        ? `Действует до ${new Date(profile.planExpiry).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`
                        : "Безлимитный доступ"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-center">
                    <div className="text-xs text-muted-foreground">Поездок</div>
                    <div className="text-sm font-bold text-amber-600 dark:text-amber-400">Безлимит</div>
                  </div>
                  <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-center">
                    <div className="text-xs text-muted-foreground">Участников</div>
                    <div className="text-sm font-bold text-amber-600 dark:text-amber-400">Безлимит</div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 }}
                onClick={() => setPremiumOpen(true)}
                className="w-full rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 p-4 text-left shadow-xl shadow-amber-500/20 active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-white/20 backdrop-blur grid place-items-center">
                    <Crown className="size-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-base text-white flex items-center gap-2">
                      Получить Premium
                    </div>
                    <div className="text-xs text-white/80 mt-0.5">
                      Безлимитные поездки, участники, AI-фичи
                    </div>
                  </div>
                  <ArrowRight className="size-5 text-white" />
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/20">
                  <div className="flex items-center gap-4 text-white/90 text-xs">
                    <span className="flex items-center gap-1"><Sparkles className="size-3" /> AI</span>
                    <span className="flex items-center gap-1"><Plane className="size-3" /> ∞ поездок</span>
                    <span className="flex items-center gap-1"><Users className="size-3" /> ∞ друзей</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-white/70">от</div>
                    <div className="text-lg font-bold text-white">$5</div>
                  </div>
                </div>
              </motion.button>
            )}

            {/* Лимиты freemium (показываем только для free) */}
            {!profile.isPremium && profile.limits && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 }}
                className="rounded-2xl bg-muted/50 border border-border p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Info className="size-4 text-muted-foreground" />
                  <h3 className="font-semibold text-sm">Твой Free план</h3>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Создание поездок</span>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 1 }).map((_, i) => (
                          <div key={i} className={cn(
                            "h-1.5 w-6 rounded-full",
                            i < profile.stats.ownedTrips ? "bg-primary" : "bg-muted-foreground/20"
                          )} />
                        ))}
                      </div>
                      <span className="font-medium tabular-nums">
                        {profile.stats.ownedTrips} / {profile.limits.maxOwnedTrips}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Участников в поездке</span>
                    <span className="font-medium">{profile.limits.maxMembersPerTrip} макс</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Участие в чужих поездках</span>
                    <span className="font-medium text-green-600">Безлимит ✅</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    💡 Ты можешь быть приглашён в любое количество поездок друзей без лимита.
                    Лимит 1 поездка действует только на поездки, которые ты <b>создаёшь сам</b>.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Статистика */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="grid grid-cols-3 gap-2"
            >
              {stats.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="rounded-2xl bg-card border border-border p-3 text-center">
                    <div
                      className="size-9 mx-auto rounded-xl grid place-items-center mb-1.5"
                      style={{ background: `${s.color}22` }}
                    >
                      <Icon className="size-4.5" style={{ color: s.color }} />
                    </div>
                    <div className="text-lg font-bold tabular-nums">{s.value}</div>
                    <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  </div>
                );
              })}
            </motion.div>

            {/* Достижения */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl bg-card border border-border overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Trophy className="size-4 text-amber-500" />
                <h3 className="font-semibold text-sm">Достижения</h3>
                <span className="ml-auto text-xs text-muted-foreground">
                  {profile.achievements.filter((a) => a.unlocked).length} / {profile.achievements.length}
                </span>
              </div>
              <div className="p-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
                {profile.achievements.map((a, i) => (
                  <motion.div
                    key={a.label}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.15 + i * 0.02 }}
                    className={cn(
                      "aspect-square rounded-xl grid place-items-center text-center transition-all relative group",
                      a.unlocked
                        ? "bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30"
                        : "bg-muted/50 border border-border opacity-40 grayscale"
                    )}
                    title={`${a.label} — ${a.req}`}
                  >
                    <div className="text-2xl">{a.emoji}</div>
                    <div className="absolute -bottom-0.5 inset-x-0 text-[8px] text-muted-foreground truncate px-0.5">
                      {a.label}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Мои поездки */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl bg-card border border-border overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Plane className="size-4 text-primary" />
                <h3 className="font-semibold text-sm">Мои поездки</h3>
                <span className="ml-auto text-xs text-muted-foreground">
                  {profile.limits?.maxOwnedTrips === null
                    ? `${profile.trips.length} всего`
                    : `создано ${profile.stats.ownedTrips}/${profile.limits?.maxOwnedTrips} · всего ${profile.trips.length}`}
                </span>
              </div>
              <div className="divide-y divide-border">
                {profile.trips.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-muted-foreground mb-3">У вас пока нет поездок</p>
                    <button
                      onClick={() => router.push("/")}
                      className="text-sm text-primary font-medium"
                    >
                      Создать первую →
                    </button>
                  </div>
                ) : (
                  profile.trips.map((trip) => {
                    const currentTripId = typeof window !== "undefined" ? getTripId() : "";
                    const isCurrent = trip.id === currentTripId;
                    return (
                      <button
                        key={trip.id}
                        onClick={() => openTrip(trip.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 text-left transition-colors",
                          isCurrent ? "bg-primary/5" : "hover:bg-accent/50"
                        )}
                      >
                        <div
                          className="size-11 rounded-xl grid place-items-center text-2xl shrink-0 shadow-sm"
                          style={{ background: trip.coverColor }}
                        >
                          {trip.coverEmoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{trip.title}</div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            <span>{new Date(trip.startDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
                            <span>·</span>
                            <span>{trip.totalDays} дн</span>
                            <span>·</span>
                            <span>{trip.members} чел</span>
                            {trip.role === "owner" && <span className="text-primary font-medium">· создатель</span>}
                          </div>
                        </div>
                        {isCurrent ? (
                          <div className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                            текущая
                          </div>
                        ) : (
                          <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>

            {/* Настройки */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl bg-card border border-border overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Settings className="size-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Настройки</h3>
              </div>
              <div className="divide-y divide-border">
                {/* Тема */}
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-accent/50 transition-colors"
                >
                  <div className="size-9 rounded-xl bg-secondary grid place-items-center">
                    {theme === "dark" ? <Moon className="size-4.5" /> : <Sun className="size-4.5" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Тема оформления</div>
                    <div className="text-xs text-muted-foreground">{theme === "dark" ? "Тёмная" : "Светлая"}</div>
                  </div>
                  <div className="w-10 h-6 rounded-full bg-muted relative transition-colors">
                    <div className={cn(
                      "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                      theme === "dark" ? "translate-x-4" : "translate-x-0.5"
                    )} />
                  </div>
                </button>

                {/* Premium / Подписка */}
                <button
                  onClick={() => setPremiumOpen(true)}
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-accent/50 transition-colors"
                >
                  <div className={cn(
                    "size-9 rounded-xl grid place-items-center",
                    profile.isPremium ? "bg-gradient-to-br from-amber-500 to-orange-500" : "bg-secondary"
                  )}>
                    <Crown className={cn("size-4.5", profile.isPremium ? "text-white" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Подписка</div>
                    <div className="text-xs text-muted-foreground">
                      {profile.isPremium
                        ? `Premium · до ${profile.planExpiry ? new Date(profile.planExpiry).toLocaleDateString("ru-RU") : ""}`
                        : "Free план · обновить →"}
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </button>

                {/* Push-уведомления */}
                <div className="flex items-center gap-3 p-3.5">
                  <div className="size-9 rounded-xl bg-secondary grid place-items-center">
                    <Bell className="size-4.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Push-уведомления</div>
                    <div className="text-xs text-muted-foreground">Оповещения о поездках</div>
                  </div>
                  <PushToggle />
                </div>

                {/* О приложении */}
                <div className="flex items-center gap-3 p-3.5">
                  <div className="size-9 rounded-xl bg-secondary grid place-items-center">
                    <Info className="size-4.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">TripTrek China</div>
                    <div className="text-xs text-muted-foreground">Версия 1.0.0 · Made with ❤️</div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Кнопка выхода */}
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 py-3.5 font-medium flex items-center justify-center gap-2 hover:bg-destructive/20 transition-colors disabled:opacity-50"
            >
              {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              Выйти из аккаунта
            </motion.button>
          </>
        )}
      </main>

      <PremiumModal open={premiumOpen} onOpenChange={setPremiumOpen} />
    </div>
  );
}

// Push toggle component
function PushToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "Notification" in navigator) {
      setEnabled(Notification.permission === "granted");
    }
  }, []);

  const toggle = async () => {
    if (!("Notification" in navigator)) {
      toast.error("Уведомления не поддерживаются");
      return;
    }
    setLoading(true);
    try {
      if (Notification.permission === "granted") {
        // Can't easily revoke, just toggle UI
        setEnabled(false);
        toast.info("Уведомления отключены");
      } else {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          setEnabled(true);
          toast.success("Уведомления включены 🔔");
        } else {
          toast.error("Разрешение отклонено");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={cn(
        "w-10 h-6 rounded-full relative transition-colors shrink-0",
        enabled ? "bg-primary" : "bg-muted"
      )}
    >
      <div className={cn(
        "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
        enabled ? "translate-x-4" : "translate-x-0.5"
      )} />
    </button>
  );
}
