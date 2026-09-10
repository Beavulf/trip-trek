"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
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
import { ProfileStats } from "./ProfileStats";
import { AchievementsGrid } from "./AchievementsGrid";
import { TripsList } from "./TripsList";
import { ProfileSettings } from "./ProfileSettings";
import { EditProfileSheet } from "./EditProfileSheet";

export function ProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const qc = useQueryClient();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const userId = (session?.user as { id?: string } | undefined)?.id || "";

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
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/user/avatar", { method: "POST", body: fd });
      if (!r.ok) throw new Error("upload failed");
      toast.success("Фото обновлено 📸");
      qc.invalidateQueries({ queryKey: ["user-profile"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
    } catch {
      toast.error("Не удалось загрузить фото");
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
    ["trip", "days", "expenses", "photos", "journal", "board", "checklist", "info", "phrases", "foods", "budget-plan"]
      .forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
    router.push("/");
  };

  if (status === "loading" || status === "unauthenticated" || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
        {isError ? (
          <div className="py-16 text-center space-y-3">
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
        ) : isLoading || !profile ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
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

            <ProfileSettings profile={profile} setPremiumOpen={setPremiumOpen} />

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

            <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 pt-1">
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

      {/* Подтверждение выхода */}
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из аккаунта?</AlertDialogTitle>
            <AlertDialogDescription>
              {profile?.email ? `Профиль ${profile.email} останется на сервере — просто снова войди при необходимости.` : "Войдёшь снова тем же email и паролем."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 rounded-xl">Остаться</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setSignOutOpen(false);
                void handleSignOut();
              }}
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              Выйти
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PremiumModal open={premiumOpen} onOpenChange={setPremiumOpen} />
    </div>
  );
}
