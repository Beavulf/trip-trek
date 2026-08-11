"use client";

import { motion } from "framer-motion";
import { Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserProfile } from "./types";

interface AchievementsGridProps {
  profile: UserProfile;
  selectedAchievement: string | null;
  setSelectedAchievement: (v: string | null) => void;
}

export function AchievementsGrid({ profile, selectedAchievement, setSelectedAchievement }: AchievementsGridProps) {
  const selectedAchievementData = profile.achievements.find(a => a.label === selectedAchievement);

  return (
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
      <div className="p-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
        {profile.achievements.map((a, i) => (
          <motion.button
            key={a.label}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.02 }}
            onClick={() => setSelectedAchievement(selectedAchievement === a.label ? null : a.label)}
            className={cn(
              "rounded-xl p-2 flex flex-col items-center gap-1 text-center transition-all group",
              a.unlocked
                ? "bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30"
                : "bg-muted/50 border border-border opacity-40 grayscale",
              selectedAchievement === a.label && "ring-2 ring-primary scale-105"
            )}
          >
            <div className="text-2xl leading-none">{a.emoji}</div>
            <div className="text-[9px] font-medium leading-tight line-clamp-2 break-words w-full">
              {a.label}
            </div>
            {!a.unlocked && (
              <div className="text-[8px] text-muted-foreground">🔒</div>
            )}
          </motion.button>
        ))}
      </div>

      {/* Описание выбранного достижения */}
      {selectedAchievementData && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="px-4 pb-3"
        >
          <div className={cn(
            "rounded-xl p-3 flex items-start gap-3 border",
            selectedAchievementData.unlocked
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-muted/50 border-border"
          )}>
            <div className="text-3xl shrink-0">{selectedAchievementData.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm flex items-center gap-2">
                {selectedAchievementData.label}
                {selectedAchievementData.unlocked ? (
                  <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">✓ Получено</span>
                ) : (
                  <span className="text-[10px] bg-muted-foreground/20 text-muted-foreground px-1.5 py-0.5 rounded-full">🔒 Заблокировано</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {selectedAchievementData.unlocked
                  ? "Достижение разблокировано!"
                  : "Как получить:"
                } {selectedAchievementData.req}
              </div>
            </div>
            <button
              onClick={() => setSelectedAchievement(null)}
              className="size-6 rounded-full hover:bg-accent grid place-items-center text-muted-foreground shrink-0"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
