"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth as useSession } from "@/hooks/use-auth";
import { Loader2, ChevronLeft, LogOut } from "lucide-react";
import { toast } from "sonner";
import { PremiumModal } from "@/components/trip/premium-modal";
import { getTripId, setTripId } from "@/hooks/use-trip";
import type { UserProfile } from "./types";
import { ProfileHeader, PremiumActiveCard, PremiumCTA } from "./ProfileHeader";
import { ProfileStats, FreemiumLimits } from "./ProfileStats";
import { AchievementsGrid } from "./AchievementsGrid";
import { TripsList } from "./TripsList";
import { ProfileSettings } from "./ProfileSettings";

export function ProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const qc = useQueryClient();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👤");
  const [color, setColor] = useState("#94a3b8");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const userId = (session?.user as { id?: string } | undefined)?.id || "";

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("userId", userId);
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

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
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
    ["trip", "days", "expenses", "photos", "journal", "board", "checklist", "info", "phrases", "foods", "budget-plan"]
      .forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
    router.push("/");
  };

  const cancelEdit = () => {
    setEditing(false);
    if (profile) {
      setName(profile.name);
      setEmoji(profile.emoji);
      setColor(profile.color);
    }
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
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(circle at 30% 0%, var(--primary) 0%, transparent 50%), radial-gradient(circle at 70% 100%, #8b5cf6 0%, transparent 50%)",
      }} />

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
            <ProfileHeader
              profile={profile}
              editing={editing}
              setEditing={setEditing}
              setPremiumOpen={setPremiumOpen}
              name={name}
              setName={setName}
              emoji={emoji}
              setEmoji={setEmoji}
              color={color}
              setColor={setColor}
              saving={saving}
              uploadingAvatar={uploadingAvatar}
              saveProfile={saveProfile}
              handleAvatarUpload={handleAvatarUpload}
              avatarInputRef={avatarInputRef}
              onCancelEdit={cancelEdit}
            />

            {profile.isPremium ? (
              <PremiumActiveCard profile={profile} />
            ) : (
              <PremiumCTA onOpen={() => setPremiumOpen(true)} />
            )}

            <FreemiumLimits profile={profile} />

            <ProfileStats profile={profile} />

            <AchievementsGrid
              profile={profile}
              selectedAchievement={selectedAchievement}
              setSelectedAchievement={setSelectedAchievement}
            />

            <TripsList
              profile={profile}
              onOpenTrip={openTrip}
              onCreateTrip={() => router.push("/")}
            />

            <ProfileSettings profile={profile} setPremiumOpen={setPremiumOpen} />

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
