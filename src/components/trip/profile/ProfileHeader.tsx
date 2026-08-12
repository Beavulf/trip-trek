"use client";

import { motion } from "framer-motion";
import { ArrowRight, Camera, Crown } from "lucide-react";
import type { UserProfile } from "./types";
import { ProfileAvatar } from "./ProfileAvatar";

interface ProfileHeaderProps {
  profile: UserProfile;
  editing: boolean;
  setEditing: (v: boolean) => void;
  setPremiumOpen: (v: boolean) => void;
  name: string;
  setName: (v: string) => void;
  emoji: string;
  setEmoji: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  saving: boolean;
  uploadingAvatar: boolean;
  saveProfile: () => void;
  handleAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  avatarInputRef: React.RefObject<HTMLInputElement | null>;
  onCancelEdit: () => void;
}

export function ProfileHeader({
  profile,
  editing,
  setEditing,
  setPremiumOpen,
  name,
  setName,
  emoji,
  setEmoji,
  color,
  setColor,
  saving,
  uploadingAvatar,
  saveProfile,
  handleAvatarUpload,
  avatarInputRef,
  onCancelEdit,
}: ProfileHeaderProps) {
  return (
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
          <div className="relative shrink-0">
            <div
              className="size-24 rounded-3xl overflow-hidden grid place-items-center text-5xl shadow-xl border-4 border-background transition-transform"
              style={{ background: profile.color }}
            >
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
              ) : editing && !profile.avatarUrl ? (
                <span className="text-5xl select-none">{emoji}</span>
              ) : (
                <span>{profile.emoji}</span>
              )}
            </div>
            {editing && (
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 size-11 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg border-2 border-background"
                title="Загрузить фото"
                aria-label="Загрузить фото"
              >
                <Camera className="size-4" />
              </button>
            )}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
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

        {/* Кнопка редактировать / редактор */}
        {editing ? (
          <ProfileAvatar
            profile={profile}
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
            onCancel={onCancelEdit}
          />
        ) : (
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex-1 min-h-11 rounded-xl bg-secondary border border-border py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors"
            >
              <Camera className="size-4" /> Редактировать
            </button>
            {!profile.isPremium && (
              <button
                type="button"
                onClick={() => setPremiumOpen(true)}
                className="flex-1 min-h-11 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2.5 text-sm font-medium flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
              >
                <Crown className="size-4" /> Premium
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Premium-карточка — крупная, для основной CTA (показывается когда НЕ Premium)
export function PremiumCTA({ onOpen }: { onOpen: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 }}
      onClick={onOpen}
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
          <span className="flex items-center gap-1">✨ AI</span>
          <span className="flex items-center gap-1">✈️ ∞ поездок</span>
          <span className="flex items-center gap-1">👥 ∞ друзей</span>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/70">от</div>
          <div className="text-lg font-bold text-white">$5</div>
        </div>
      </div>
    </motion.button>
  );
}

// Premium-карточка — когда уже Premium активен
export function PremiumActiveCard({ profile }: { profile: UserProfile }) {
  return (
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
  );
}
