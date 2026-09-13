"use client";

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Wallet, Calendar, Loader2, Sparkles, Check, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { setTripId } from "@/hooks/use-trip";
import { TRIP_TEMPLATES } from "@/lib/trip-templates";
import { useTripStore } from "@/lib/trip-store";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TemplatePicker({ open, onOpenChange }: TemplatePickerProps) {
  useBodyScrollLock(open);
  const router = useRouter();
  const qc = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });

  const createFromTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const r = await fetch("/api/trips/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          customTitle: customTitle.trim() || undefined,
          startDate: startDate || undefined,
        }),
      });
      if (r.status === 403) {
        const err = await r.json();
        throw new Error(err.upgrade ? "LIMIT_REACHED" : err.error);
      }
      if (!r.ok) throw new Error("create failed");
      return r.json();
    },
    onError: (error) => {
      if (error.message === "LIMIT_REACHED") {
        toast.error("Лимит поездок исчерпан", {
          description: "Перейдите на Premium для безлимитных поездок",
        });
      } else {
        toast.error("Не удалось создать поездку");
      }
    },
    onSuccess: (data) => {
      useTripStore.getState().setPendingTripId(data.id);
      setTripId(data.id);
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
      qc.invalidateQueries({ queryKey: ["route"] });
      toast.success(data.message || "Поездка создана! 🎉");
      onOpenChange(false);
      setSelectedTemplate(null);
      setCustomTitle("");
      router.push("/");
    },
  });

  if (!open || typeof document === "undefined") return null;

  const selected = TRIP_TEMPLATES.find((t) => t.id === selectedTemplate) ?? null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[95dvh] flex flex-col"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/90 to-rose-500/90 px-4 py-3.5 flex items-center justify-between text-white shrink-0">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Sparkles className="size-5" /> Шаблоны поездок
            </h2>
            <button onClick={() => onOpenChange(false)} className="size-11 rounded-full bg-white/20 hover:bg-white/30 grid place-items-center" aria-label="Закрыть">
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Выбери готовый маршрут — места, еда и фразы создадутся автоматически
              </p>

              {/* Templates */}
              <div className="space-y-3">
                {TRIP_TEMPLATES.map((template, i) => {
                  const isSelected = selectedTemplate === template.id;
                  const placesCount = template.days.reduce((n, d) => n + d.places.length, 0);
                  return (
                    <motion.button
                      type="button"
                      key={template.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedTemplate(isSelected ? null : template.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        "relative w-full text-left rounded-2xl border-2 overflow-hidden transition-all",
                        isSelected ? "border-primary shadow-lg" : "border-border hover:border-primary/40"
                      )}
                    >
                      {/* Cover */}
                      <div
                        className="relative h-20 flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${template.coverColor}dd, ${template.coverColor}88)`,
                        }}
                      >
                        <div className="absolute inset-0 opacity-20" style={{
                          backgroundImage: "radial-gradient(circle at 30% 50%, white 0%, transparent 50%), radial-gradient(circle at 70% 50%, white 0%, transparent 50%)",
                        }} />
                        <span className="text-4xl relative z-10 drop-shadow-lg">{template.coverEmoji}</span>
                        {isSelected && (
                          <div className="absolute top-2 right-2 size-7 rounded-full bg-white grid place-items-center shadow-lg">
                            <Check className="size-4 text-green-600" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-3.5">
                        <h3 className="font-bold text-sm leading-tight mb-1">{template.title}</h3>
                        <p className="text-xs text-muted-foreground mb-2.5 line-clamp-2">{template.description}</p>

                        {/* Stats */}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3" /> {template.totalDays} дн
                          </span>
                          <span className="flex items-center gap-1">
                            <Wallet className="size-3" /> ${template.totalBudget}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" /> {placesCount} мест
                          </span>
                          <span className="flex items-center gap-1">
                            <UtensilsCrossed className="size-3" /> {template.foods.length} блюд
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Липкая панель действий выбранного шаблона */}
          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ type: "spring", stiffness: 350, damping: 32 }}
                className="shrink-0 border-t border-border bg-card/95 backdrop-blur p-3 space-y-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
              >
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder={`Название: ${selected.title.split(":")[0]}`}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile"
                  />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    aria-label="Дата старта"
                    className="rounded-xl border border-input bg-background px-2.5 py-2.5 text-sm input-mobile"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => createFromTemplate.mutate(selected.id)}
                  disabled={createFromTemplate.isPending}
                  className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  {createFromTemplate.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Создаём поездку…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      Создать{customTitle.trim() ? ` «${customTitle.trim()}»` : ""}
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
