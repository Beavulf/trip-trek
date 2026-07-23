"use client";

import { useJournal, useAddJournal, useDeleteJournal, useTrip } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, Trash2, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MOODS = ["😊", "🤩", "😴", "🤤", "🥳", "🤔", "😍", "😰", "🔥", "💖"];

export function Journal() {
  const { data: entries, isLoading } = useJournal();
  const { data: trip } = useTrip();
  const add = useAddJournal();
  const del = useDeleteJournal();
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("😊");
  const [dayId, setDayId] = useState("");

  if (isLoading || !trip) {
    return <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Загрузка дневника…</div>;
  }

  const submit = async () => {
    if (!content.trim()) {
      toast.error("Напишите что-нибудь");
      return;
    }
    const targetDay = dayId || trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id;
    if (!targetDay) return;
    await add.mutateAsync({
      dayId: targetDay,
      content,
      mood,
      participantId: trip.settings.currentUserId ?? undefined,
    });
    toast.success("Запись добавлена 📔");
    setContent("");
  };

  // Группировка по дням
  const grouped = trip.days
    .map((d) => ({
      day: d,
      entries: entries?.filter((e) => e.dayId === d.id) ?? [],
    }))
    .filter((g) => g.entries.length > 0);

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-6 -right-6 text-[100px] opacity-15 select-none">📔</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <BookOpen className="size-4" /> Дневник
          </div>
          <h1 className="text-2xl font-bold">Воспоминания в пути</h1>
          <p className="text-white/80 text-sm mt-1">{entries?.length ?? 0} записей</p>
        </div>
      </div>

      {/* Форма добавления */}
      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {MOODS.map((m) => (
            <button
              key={m}
              onClick={() => setMood(m)}
              className={cn(
                "size-9 rounded-lg text-lg grid place-items-center transition-all",
                mood === m ? "bg-primary/20 ring-2 ring-primary scale-110" : "bg-muted hover:bg-accent"
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Что запомнилось сегодня?"
          rows={3}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
        />
        <div className="flex gap-2">
          <select
            value={dayId}
            onChange={(e) => setDayId(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm flex-1"
          >
            <option value="">День {trip.currentDayNumber} (сегодня)</option>
            {trip.days.map((d) => (
              <option key={d.id} value={d.id}>День {d.dayNumber} · {d.city}</option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={add.isPending}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Добавить
          </button>
        </div>
      </div>

      {/* Лента записей */}
      {grouped.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <BookOpen className="size-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Дневник пуст</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Добавьте первую запись выше</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ day, entries }) => (
            <div key={day.id}>
              <div className="flex items-center gap-2 mb-2 sticky top-[6.5rem] z-10 py-1">
                <div className="size-7 rounded-lg grid place-items-center text-white text-xs font-bold" style={{ background: day.accentColor ?? "#f97316" }}>
                  {day.dayNumber}
                </div>
                <div className="text-sm font-semibold">День {day.dayNumber} · {day.city}</div>
                <div className="text-xs text-muted-foreground truncate">{day.title}</div>
              </div>
              <div className="space-y-2 pl-9">
                <AnimatePresence>
                  {entries.map((e) => {
                    const participant = trip.participants.find((p) => p.id === e.participantId);
                    return (
                      <motion.div
                        key={e.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="relative rounded-2xl bg-card border border-border p-3 group"
                      >
                        <div className="absolute -left-7 top-3 size-3 rounded-full border-2 border-background" style={{ background: participant?.color ?? "#94a3b8" }} />
                        <div className="flex items-start gap-2">
                          {e.mood && <span className="text-2xl">{e.mood}</span>}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{e.content}</p>
                            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                              {participant && (
                                <span className="flex items-center gap-1">
                                  <span className="size-3 rounded-full grid place-items-center text-[8px]" style={{ background: participant.color }}>{participant.emoji}</span>
                                  {participant.name}
                                </span>
                              )}
                              <span>· {new Date(e.createdAt).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => { del.mutate(e.id); toast.success("Удалено"); }}
                            className="size-7 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 grid place-items-center transition-opacity"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
