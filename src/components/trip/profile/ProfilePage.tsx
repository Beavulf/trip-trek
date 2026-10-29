"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MotionConfig, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth as useSession } from "@/hooks/use-auth";
import { ChevronLeft, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
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
import { PremiumModal } from "@/components/trip/premium-modal";
import { setTripId } from "@/hooks/use-trip";
import { useTripStore } from "@/lib/trip-store";
import type { UserProfile } from "./types";
import { ProfileHeader, PremiumActiveCard, PremiumCTA } from "./ProfileHeader";
import { ProfileSkeleton } from "./ProfileSkeleton";
import { ProfileStats } from "./ProfileStats";
import { AchievementsGrid } from "./AchievementsGrid";
import { TripsList } from "./TripsList";
import { ProfileSettings } from "./ProfileSettings";
import { SupportCard } from "./SupportCard";
import { EditProfileSheet } from "./EditProfileSheet";
import { FeedbackSheet } from "@/components/trip/feedback/feedback-sheet";
import { useAdminStats } from "@/hooks/use-admin-stats";

// Предел размера фото профиля — как на сервере (api/user/avatar)
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

// reducedMotion="user": при «уменьшить движение» в системе блоки профиля появляются без сдвига и масштаба
// (раньше каждая карточка выезжала снизу независимо от настройки)
export function ProfilePage() {
  return (
    <MotionConfig reducedMotion="user">
      <ProfileScreen />
    </MotionConfig>
  );
}

function ProfileScreen() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const qc = useQueryClient();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const userId = (session?.user as { id?: string } | undefined)?.id || "";
  const isAdmin = session?.user?.isAdmin === true;
  const { data: adminStats } = useAdminStats(status === "authenticated" && isAdmin);

  const { data: profile, isLoading, isError, refetch } = useQuery<UserProfile>({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const r = await fetch("/api/user");
      if (!r.ok) throw new Error("fetch profile");
      return r.json();
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const uploadAvatar = async (file: File) => {
    if (!userId) return;
    // Те же пределы, что на сервере (5 МБ, только картинка): отказываем сразу, не гоняя файл по сети
    if (!file.type.startsWith("image/")) {
      toast.error("Нужна картинка", { description: "Выберите фото в формате JPG, PNG или WebP" });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("Фото слишком большое", { description: "Максимум 5 МБ — выберите файл поменьше" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/user/avatar", { method: "POST", body: fd });
      if (!r.ok) {
        // Причину (формат, размер, лимит загрузок) отдаёт сервер — покажем её, а не общее «не удалось»
        const b = await r.json().catch(() => ({}));
        throw new Error(typeof b?.error === "string" ? b.error : "");
      }
      toast.success("Фото обновлено 📸");
      qc.invalidateQueries({ queryKey: ["user-profile"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    } catch (e) {
      toast.error("Не удалось загрузить фото", {
        description: e instanceof Error && e.message ? e.message : "Проверьте соединение и попробуйте ещё раз",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadAvatar(file);
    e.target.value = "";
  };

  const removeAvatar = async () => {
    try {
      const r = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: null }),
      });
      if (!r.ok) throw new Error("remove failed");
      toast.success("Фото убрано — снова эмодзи");
      qc.invalidateQueries({ queryKey: ["user-profile"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    } catch {
      toast.error("Не удалось убрать фото");
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const r = await fetch("/api/auth/custom-signout", { method: "POST" });
      if (!r.ok) throw new Error("signout failed");
      // Уходим со страницы целиком: signingOut не сбрасываем, чтобы кнопка не «ожила» до перехода
      window.location.assign("/login");
    } catch {
      // Раньше при ошибке всё равно уводило на /login, хотя сессия оставалась — и вход тут же возвращал назад
      toast.error("Не удалось выйти", { description: "Проверьте соединение и попробуйте ещё раз" });
      setSigningOut(false);
    }
  };

  const openTrip = (tripId: string) => {
    setTripId(tripId);
    ["trip", "days", "expenses", "photos", "journal", "board", "checklist", "info", "phrases", "foods", "budget-plan"]
      .forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
    router.push("/");
  };

  // Сессия ещё грузится (или идёт редирект на /login) — та же оболочка со скелетоном, без отдельного
  // полноэкранного спиннера: иначе на входе были два «мигания» подряд (спиннер → шапка → контент)
  const waiting = status === "loading" || status === "unauthenticated" || !userId;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass-strong border-b border-border/80 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="Назад"
            className="size-11 rounded-full grid place-items-center bg-secondary border border-border hover:bg-accent transition-colors"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="font-bold text-base">Профиль</h1>
          <div className="w-11" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 pb-24 space-y-4">
        {isError && !waiting ? (
          <div role="alert" className="py-16 text-center space-y-3">
            <div className="text-4xl">🤔</div>
            <p className="text-sm font-medium">Не удалось загрузить профиль</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Повторить
            </button>
          </div>
        ) : waiting || isLoading || !profile ? (
          <ProfileSkeleton />
        ) : (
          <>
            <ProfileHeader profile={profile} onEdit={() => setEditOpen(true)} />

            {profile.isPremium ? (
              <PremiumActiveCard profile={profile} />
            ) : (
              <PremiumCTA profile={profile} onOpen={() => setPremiumOpen(true)} />
            )}

            <ProfileStats profile={profile} />

            <AchievementsGrid profile={profile} onOpenPremium={() => setPremiumOpen(true)} />

            <TripsList
              profile={profile}
              onOpenTrip={openTrip}
              onCreateTrip={() => {
                router.push("/");
                useTripStore.getState().setTripSwitcherOpen(true);
              }}
            />

            <ProfileSettings
              profile={profile}
              setPremiumOpen={setPremiumOpen}
              onReportBug={() => setBugOpen(true)}
              isAdmin={isAdmin}
              feedbackNew={adminStats?.feedback.new ?? 0}
            />

            {/* «Поддержать TripTrek»: появляется, только если админ задал реквизиты */}
            <SupportCard onReportBug={() => setBugOpen(true)} />

            <motion.button
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              onClick={() => setSignOutOpen(true)}
              className="w-full min-h-12 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 font-medium flex items-center justify-center gap-2 hover:bg-destructive/20 transition-colors active:scale-[0.98]"
            >
              <LogOut className="size-4" />
              Выйти из аккаунта
            </motion.button>

            <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80 pt-1">
              TripTrek · travel passport
            </p>
          </>
        )}
      </main>

      {/* Редактирование профиля */}
      {profile && (
        <EditProfileSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          profile={profile}
          uploadingAvatar={uploadingAvatar}
          onAvatarFile={handleAvatarFile}
          onRemoveAvatar={removeAvatar}
        />
      )}

      {/* Обратная связь: монтируем по клику, чтобы окно каждый раз открывалось с чистого состояния */}
      {bugOpen && <FeedbackSheet open onOpenChange={setBugOpen} />}

      {/* Подтверждение выхода */}
      {/* Пока идёт выход, окно не закрывается: иначе «ничего не происходит» до перехода, и кнопку жмут повторно */}
      <AlertDialog open={signOutOpen} onOpenChange={(v) => !signingOut && setSignOutOpen(v)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из аккаунта?</AlertDialogTitle>
            <AlertDialogDescription>
              {profile?.email ? `Профиль ${profile.email} останется на сервере — просто снова войди при необходимости.` : "Войдёшь снова тем же email и паролем."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={signingOut} className="mt-0 rounded-xl">Остаться</AlertDialogCancel>
            <AlertDialogAction
              disabled={signingOut}
              onClick={(e) => {
                e.preventDefault();
                void handleSignOut();
              }}
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              {signingOut ? "Выходим…" : "Выйти"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PremiumModal open={premiumOpen} onOpenChange={setPremiumOpen} />
    </div>
  );
}
