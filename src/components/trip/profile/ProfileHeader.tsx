"use client";

import { motion } from "framer-motion";
import { ArrowRight, Crown, MapPin, Pencil, Plane } from "lucide-react";
import { plural } from "@/lib/utils";
import type { UserProfile } from "./types";

interface ProfileHeaderProps {
  profile: UserProfile;
  onEdit: () => void;
}

/** Штамп «С нами с …» — иммиграционный оттиск в углу баннера */
function MemberSinceStamp({ date }: { date: string }) {
  const year = new Date(date).getFullYear();
  const ink = "rgba(255,255,255,0.88)";
  return (
    <svg
      viewBox="0 0 100 100"
      className="size-20 sm:size-24 -rotate-12 drop-shadow-sm pointer-events-none"
      aria-label={`В TripTrek с ${year} года`}
      role="img"
    >
      <defs>
        <path id="stamp-ring" d="M 50,50 m -37,0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0" />
      </defs>
      <circle cx="50" cy="50" r="48" fill="none" stroke={ink} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="29" fill="none" stroke={ink} strokeWidth="1.2" />
      <text fill={ink} fontSize="8.5" fontFamily="var(--font-geist-mono), ui-monospace, monospace" letterSpacing="2.2">
        <textPath href="#stamp-ring">TRIPTREK ★ TRAVEL PASSPORT ★</textPath>
      </text>
      <text x="50" y="46" textAnchor="middle" fill={ink} fontSize="8" fontFamily="var(--font-geist-mono), ui-monospace, monospace" letterSpacing="1.5">
        С НАМИ С
      </text>
      <text x="50" y="63" textAnchor="middle" fill={ink} fontSize="17" fontWeight="700" fontFamily="var(--font-geist-mono), ui-monospace, monospace">
        {year}
      </text>
    </svg>
  );
}

export function ProfileHeader({ profile, onEdit }: ProfileHeaderProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl overflow-hidden border border-border bg-card shadow-sm"
      aria-label="Профиль"
    >
      {/* Баннер цвета пользователя + штамп */}
      <div
        className="h-24 sm:h-32 relative"
        style={{ background: `linear-gradient(135deg, ${profile.color}cc, ${profile.color}55)` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, white 0%, transparent 40%), radial-gradient(circle at 80% 30%, white 0%, transparent 40%)",
          }}
        />
        {profile.isPremium && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold shadow-lg">
            <Crown className="size-3.5" /> Premium
          </div>
        )}
        <div className="absolute top-2 right-3">
          <MemberSinceStamp date={profile.createdAt} />
        </div>
      </div>

      {/* Аватар + имя */}
      <div className="px-4 pb-4 -mt-12 relative">
        <div className="flex items-end gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="relative shrink-0 rounded-3xl focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            aria-label="Редактировать профиль"
          >
            <div
              className="size-24 rounded-3xl overflow-hidden grid place-items-center text-5xl shadow-xl border-4 border-card transition-transform active:scale-95"
              style={{ background: profile.color }}
            >
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <span className="select-none">{profile.emoji}</span>
              )}
            </div>
            <span className="absolute -bottom-1 -right-1 size-9 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg border-2 border-card">
              <Pencil className="size-3.5" />
            </span>
          </button>

          <div className="flex-1 min-w-0 pb-1">
            <h2 className="text-xl font-bold truncate">{profile.name}</h2>
            <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
            <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Plane className="size-3" style={{ color: profile.color }} />
                {profile.stats.trips} {plural(profile.stats.trips, "поездка", "поездки", "поездок")}
              </span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" style={{ color: profile.color }} />
                {profile.stats.visitedPlaces} {plural(profile.stats.visitedPlaces, "место", "места", "мест")}
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="mt-3 w-full min-h-11 rounded-xl bg-secondary border border-border py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors active:scale-[0.98]"
        >
          <Pencil className="size-4" /> Редактировать профиль
        </button>
      </div>
    </motion.section>
  );
}

/** Premium-CTA с живыми лимитами Free-плана внутри */
export function PremiumCTA({ profile, onOpen }: { profile: UserProfile; onOpen: () => void }) {
  const used = profile.stats.ownedTrips;
  const max = profile.limits?.maxOwnedTrips ?? 1;
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 }}
      onClick={onOpen}
      className="w-full rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 p-4 text-left shadow-xl shadow-amber-500/20 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-2xl bg-white/20 backdrop-blur grid place-items-center shrink-0">
          <Crown className="size-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-base text-white">TripTrek Premium</div>
          <div className="text-xs text-white/80 mt-0.5">Безлимитные поездки и друзья в них</div>
        </div>
        <ArrowRight className="size-5 text-white shrink-0" />
      </div>

      {/* Живой лимит: поездки кончаются — карточка об этом честно говорит */}
      <div className="mt-3 rounded-xl bg-black/15 px-3 py-2.5">
        <div className="flex items-center justify-between text-[11px] font-medium text-white/90">
          <span>
            Создано поездок: {used} из {max}
          </span>
          {used >= max ? (
            <span className="font-bold">лимит достигнут</span>
          ) : (
            <span className="text-white/70">участников — до {profile.limits?.maxMembersPerTrip ?? 5}</span>
          )}
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-white/25 overflow-hidden">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/20">
        <div className="flex items-center gap-3 text-white/90 text-xs">
          <span>✨ AI-фичи</span>
          <span>✈️ ∞ поездок</span>
          <span>👥 ∞ друзей</span>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-white/70">от</div>
          <div className="text-lg font-bold text-white leading-none">$5</div>
        </div>
      </div>
    </motion.button>
  );
}

/** Карточка активного Premium */
export function PremiumActiveCard({ profile }: { profile: UserProfile }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 }}
      className="rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-2 border-amber-500/40 p-4"
    >
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 grid place-items-center shadow-lg shadow-amber-500/30 shrink-0">
          <Crown className="size-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-base text-amber-600 dark:text-amber-400">Premium активен 👑</div>
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
