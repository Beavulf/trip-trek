"use client";

import { useJournal, useAddJournal, useDeleteJournal, useTrip } from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Plus, Trash2, Loader2, Send, MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MOODS, isValidMood } from "@/lib/moods";
import { useTripStore } from "@/lib/trip-store";

export function Journal() {
  const { data: entries, isLoading, error: entriesError } = useJournal();
  const { data: trip, error: tripError } = useTrip();
  const { data: session } = useAuth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";
  const add = useAddJournal();
  const del = useDeleteJournal();
  const { setActiveTab } = useTripStore();
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string>("😊");
  const [dayId, setDayId] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  // Track which entry is confirming delete (P0 #4 confirm + P2 #16 per-row pending)
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // P0 #1: нет trip / ошибка → экран ошибки, не вечный спиннер
  if (tripError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <button onClick={() => window.location.reload()} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground">
          Обновить
        </button>
      </div>
    );
  }
  if (entriesError) {
    return (
      <div className="py-16 text-center text-muted-foreground space-y-2">
        <div className="text-3xl">📔</div>
        <p className="text-sm font-medium">Не удалось загрузить дневник</p>
        <button onClick={() => window.location.reload()} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground">
          Обновить
        </button>
      </div>
    );
  }
  if (isLoading || !trip) {
    return <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Загрузка дневника…</div>;
  }

  // P0 #1: автор из session.user.id (как в Board), не trip.settings.currentUserId (который null)
  const submit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("Напишите что-нибудь");
      return;
    }
    if (trimmed.length > 5000) {
      toast.error("Слишком длинная запись (макс 5000 символов)");
      return;
    }
    // P1 #6: если нет дней — disable submit (но всё равно проверка)
    if (trip.days.length === 0) {
      toast.error("Сначала создайте день в Маршруте");
      return;
    }
    const targetDay = dayId || trip.days.find((d) => d.dayNumber === trip.currentDayNumber)?.id;
    if (!targetDay) {
      toast.error("Выберите день");
      return;
    }
    // P1 #10: mood whitelist на клиенте
    const safeMood = mood && isValidMood(mood) ? mood : undefined;
    try {
      await add.mutateAsync({
        dayId: targetDay,
        content: trimmed,
        mood: safeMood,
        userId: currentUserId,
      });
      toast.success("Запись добавлена 📔");
      setContent("");
      setMood("😊");
    } catch (err) {
      toast.error("Не удалось добавить запись", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
      // P1 #7: НЕ чистим textarea при ошибке — пусть пользователь видит что ввёл
    }
  };

  // P0 #4: delete with try/catch, toast onSuccess (не сразу)
  const handleDelete = async (id: string) => {
    try {
      await del.mutateAsync(id);
      toast.success("Удалено");
      setConfirmingId(null);
    } catch (err) {
      toast.error("Не удалось удалить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  const hasDays = trip.days.length > 0;
  // P1 #8: фильтр по автору
  const filteredEntries = authorFilter === "all"
    ? entries
    : entries?.filter((e) => e.userId === authorFilter);

  // Группировка по дням (только дни этой поездки)
  const grouped = trip.days
    .map((d) => ({
      day: d,
      entries: filteredEntries?.filter((e) => e.dayId === d.id) ?? [],
    }))
    .filter((g) => g.entries.length > 0);

  // P1 #8: уникальные авторы для chip-фильтра
  const authors = Array.from(new Set(entries?.map((e) => e.userId).filter(Boolean) as string[]))
    .map((uid) => {
      const entry = entries?.find((e) => e.userId === uid);
      return { id: uid, name: entry?.user?.name || "Гость", emoji: entry?.user?.emoji || "👤", color: entry?.user?.color || "#94a3b8" };
    });

  const totalEntries = entries?.length ?? 0;

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
          <p className="text-white/80 text-sm mt-1">
            {totalEntries} {totalEntries === 1 ? "запись" : totalEntries < 5 ? "записи" : "записей"}
            {authors.length > 1 && <span className="text-white/60"> · {authors.length} автора</span>}
          </p>
        </div>
      </div>

      {/* Форма добавления — disabled если нет дней (P1 #6) */}
      <div className={cn("rounded-2xl bg-card border border-border p-4 space-y-3", !hasDays && "opacity-60")}>
        {hasDays ? (
          <>
            <div className="flex gap-1.5 flex-wrap">
              {MOODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMood(m)}
                  aria-label={`Настроение ${m}`}
                  aria-pressed={mood === m}
                  className={cn(
                    "size-9 rounded-lg text-lg grid place-items-center transition-all min-h-[36px]",
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
              maxLength={5000}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{content.length}/5000</span>
              {content.trim() && <span className="text-primary">Готово к отправке ✓</span>}
            </div>
            <div className="flex gap-2">
              <select
                value={dayId}
                onChange={(e) => setDayId(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm flex-1 min-h-[40px]"
              >
                <option value="">День {trip.currentDayNumber} (сегодня)</option>
                {trip.days
                  .filter((d) => d.dayNumber !== trip.currentDayNumber)
                  .map((d) => (
                    <option key={d.id} value={d.id}>День {d.dayNumber} · {d.city}</option>
                  ))}
              </select>
              <button
                onClick={submit}
                disabled={add.isPending}
                className="min-h-[40px] rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Добавить
              </button>
            </div>
          </>
        ) : (
          // P1 #6: нет дней → CTA «добавить день»
          <div className="text-center py-6 space-y-2">
            <div className="text-3xl">🗺️</div>
            <p className="text-sm font-medium">Сначала создайте день в Маршруте</p>
            <p className="text-xs text-muted-foreground">Записи в дневнике привязаны к дням поездки</p>
            <button
              onClick={() => setActiveTab("itinerary")}
              className="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground"
            >
              <MapPin className="size-3.5" /> Перейти в Маршрут
            </button>
          </div>
        )}
      </div>

      {/* P1 #8: фильтр по автору (если >1 автора) */}
      {authors.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setAuthorFilter("all")}
            className={cn(
              "min-h-[36px] flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              authorFilter === "all" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
            )}
          >
            Все ({totalEntries})
          </button>
          {authors.map((a) => {
            const count = entries?.filter((e) => e.userId === a.id).length ?? 0;
            return (
              <button
                key={a.id}
                onClick={() => setAuthorFilter(a.id)}
                className={cn(
                  "min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                  authorFilter === a.id ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"
                )}
              >
                <span className="size-4 rounded-full grid place-items-center text-[8px]" style={{ background: a.color }}>{a.emoji}</span>
                {a.id === currentUserId ? "Вы" : a.name}
                <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Лента записей */}
      {grouped.length === 0 ? (
        // P1 #6: различаем нет дней vs нет записей
        hasDays ? (
          <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
            <BookOpen className="size-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Дневник пуст</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {authorFilter !== "all" ? "Нет записей этого автора" : "Добавьте первую запись выше"}
            </p>
          </div>
        ) : null
      ) : (
        <div className="space-y-5">
          {grouped.map(({ day, entries: dayEntries }) => (
            <div key={day.id}>
              <div className="flex items-center gap-2 mb-2 sticky top-[5.5rem] z-10 py-1 bg-background/80 backdrop-blur-sm rounded-lg">
                <div className="size-7 rounded-lg grid place-items-center text-white text-xs font-bold shrink-0" style={{ background: day.accentColor ?? "#f97316" }}>
                  {day.dayNumber}
                </div>
                <div className="text-sm font-semibold truncate">День {day.dayNumber} · {day.city}</div>
                <div className="text-xs text-muted-foreground truncate hidden sm:block">{day.title}</div>
              </div>
              <div className="space-y-2 pl-9">
                <AnimatePresence>
                  {dayEntries.map((e) => {
                    const author = e.user;
                    const isOwn = e.userId === currentUserId;
                    const isConfirming = confirmingId === e.id;
                    const isDeleting = del.isPending && isConfirming;
                    return (
                      <motion.div
                        key={e.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="relative rounded-2xl bg-card border border-border p-3 group"
                      >
                        <div className="absolute -left-7 top-3 size-3 rounded-full border-2 border-background" style={{ background: author?.color ?? "#94a3b8" }} />
                        <div className="flex items-start gap-2">
                          {e.mood && <span className="text-2xl shrink-0">{e.mood}</span>}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{e.content}</p>
                            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                              {/* P1 #8: автор с аватаром, «Вы» если это текущий пользователь */}
                              {author && (
                                <span className="flex items-center gap-1">
                                  <span className="size-3 rounded-full grid place-items-center text-[8px]" style={{ background: author.color }}>{author.emoji}</span>
                                  <span className="font-medium">{isOwn ? "Вы" : author.name}</span>
                                </span>
                              )}
                              <span>· {new Date(e.createdAt).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
                            </div>
                          </div>
                          {/* P0 #4 + P1 #5: delete с confirm, hit-area ≥44px, видно на mobile (не только group-hover) */}
                          {isConfirming ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleDelete(e.id)}
                                disabled={isDeleting}
                                aria-label="Подтвердить удаление"
                                className="min-h-[36px] min-w-[36px] text-[10px] bg-red-500 text-white px-2 py-1 rounded-lg font-medium flex items-center gap-1"
                              >
                                {isDeleting ? <Loader2 className="size-3 animate-spin" /> : null}
                                {isDeleting ? "…" : "Да"}
                              </button>
                              <button
                                onClick={() => setConfirmingId(null)}
                                disabled={isDeleting}
                                aria-label="Отменить удаление"
                                className="min-h-[36px] min-w-[36px] text-[10px] bg-secondary px-2 py-1 rounded-lg"
                              >
                                Нет
                              </button>
                            </div>
                          ) : (
                            // P1 #5: видно на mobile всегда (opacity-100), на desktop — group-hover
                            <button
                              onClick={() => setConfirmingId(e.id)}
                              aria-label="Удалить запись"
                              className="size-9 rounded-lg md:opacity-0 md:group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 grid place-items-center transition-opacity text-muted-foreground shrink-0"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
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
