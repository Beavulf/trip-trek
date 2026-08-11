"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useTrip } from "@/hooks/use-trip";
import { BookOpen, Camera, Plus as PlusIcon, Wallet } from "lucide-react";
import { useAuth as useSession } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { PhotoForm } from "./PhotoForm";
import { ExpenseForm } from "./ExpenseForm";
import { JournalForm } from "./JournalForm";

type Mode = "photo" | "expense" | "journal";

export function QuickAddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("photo");
  const { data: trip } = useTrip();
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id || trip?.settings.currentUserId || "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto px-5 pb-6 pt-2">
        <SheetHeader className="px-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <PlusIcon className="size-4" /> Быстрое добавление
          </SheetTitle>
          <SheetDescription>
            {trip ? `День ${trip.currentDayNumber} · ${trip.days.find(d => d.dayNumber === trip.currentDayNumber)?.city ?? ""}` : ""}
          </SheetDescription>
        </SheetHeader>

        {/* Выбор режима */}
        <div className="grid grid-cols-3 gap-2.5 mt-4">
          {([
            { key: "photo", label: "Фото", icon: Camera, color: "#06b6d4" },
            { key: "expense", label: "Трата", icon: Wallet, color: "#10b981" },
            { key: "journal", label: "Заметка", icon: BookOpen, color: "#8b5cf6" },
          ] as const).map((m) => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={cn(
                  "relative flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all overflow-hidden active:scale-95",
                  active
                    ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/10"
                    : "border-border text-muted-foreground hover:bg-accent hover:border-primary/20"
                )}
              >
                {active && (
                  <div
                    className="absolute -top-3 -right-3 size-12 rounded-full opacity-15 blur-lg"
                    style={{ background: m.color }}
                  />
                )}
                <div
                  className="relative size-10 rounded-xl grid place-items-center transition-transform"
                  style={{
                    background: active ? `${m.color}22` : "transparent",
                    transform: active ? "scale(1.1)" : "scale(1)",
                  }}
                >
                  <Icon className="size-6" strokeWidth={2} style={{ color: active ? m.color : undefined }} />
                </div>
                <span className="relative text-sm font-medium">{m.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          {mode === "photo" && <PhotoForm userId={userId} onDone={() => onOpenChange(false)} />}
          {mode === "expense" && <ExpenseForm userId={userId} onDone={() => onOpenChange(false)} />}
          {mode === "journal" && <JournalForm userId={userId} onDone={() => onOpenChange(false)} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
