"use client";

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plane, MapPin, Wallet, Calendar, Loader2, Sparkles, Check } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { setTripId } from "@/hooks/use-trip";
import { TRIP_TEMPLATES } from "@/lib/trip-templates";
import { cn } from "@/lib/utils";

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
}

export function TemplatePicker({ open, onOpenChange, userId }: TemplatePickerProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState("");

  const createFromTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const r = await fetch("/api/trips/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          userId,
          customTitle: customTitle.trim() || undefined,
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
      setTripId(data.id);
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
      qc.invalidateQueries({ queryKey: ["days"] });
      toast.success(data.message || "Поездка создана! 🎉", {
        description: `${data.id}`,
      });
      onOpenChange(false);
      setSelectedTemplate(null);
      setCustomTitle("");
      router.push("/");
    },
  });

  if (!open || typeof document === "undefined") return null;

  const handleCreate = (templateId: string) => {
    setSelectedTemplate(templateId);
    createFromTemplate.mutate(templateId);
  };

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
          className="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-y-auto max-h-[95vh]"
        >
          {/* Handle */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-primary/90 to-rose-500/90 px-4 py-4 flex items-center justify-between text-white z-10">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Sparkles className="size-5" /> Шаблоны поездок
            </h2>
            <button onClick={() => onOpenChange(false)} className="size-8 rounded-full bg-white/20 hover:bg-white/30 grid place-items-center">
              <X className="size-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground text-center mb-3">
              Выбери готовый шаблон — места, еда, фразы создадутся автоматически
            </p>

            {/* Custom title input (optional) */}
            {selectedTemplate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mb-2"
              >
                <input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Своё название (необязательно)"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                  autoFocus
                />
              </motion.div>
            )}

            {/* Templates grid */}
            <div className="space-y-3">
              {TRIP_TEMPLATES.map((template, i) => {
                const isSelected = selectedTemplate === template.id;
                const isLoading = createFromTemplate.isPending && isSelected;
                return (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      "relative rounded-2xl border-2 overflow-hidden transition-all",
                      isSelected ? "border-primary shadow-lg" : "border-border hover:border-primary/30"
                    )}
                  >
                    {/* Cover */}
                    <div
                      className="relative h-24 flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${template.coverColor}dd, ${template.coverColor}88)`,
                      }}
                    >
                      <div className="absolute inset-0 opacity-20" style={{
                        backgroundImage: "radial-gradient(circle at 30% 50%, white 0%, transparent 50%), radial-gradient(circle at 70% 50%, white 0%, transparent 50%)",
                      }} />
                      <span className="text-5xl relative z-10 drop-shadow-lg">{template.coverEmoji}</span>
                      {isSelected && (
                        <div className="absolute top-2 right-2 size-7 rounded-full bg-white grid place-items-center shadow-lg">
                          {isLoading ? (
                            <Loader2 className="size-4 animate-spin text-primary" />
                          ) : (
                            <Check className="size-4 text-green-600" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <h3 className="font-bold text-sm leading-tight mb-1">{template.title}</h3>
                      <p className="text-xs text-muted-foreground mb-3">{template.description}</p>

                      {/* Stats */}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" /> {template.totalDays} дн
                        </span>
                        <span className="flex items-center gap-1">
                          <Wallet className="size-3" /> ${template.totalBudget}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" /> {template.days.length} мест
                        </span>
                        <span className="flex items-center gap-1">
                          <Plane className="size-3" /> {template.foods.length} блюд
                        </span>
                      </div>

                      {/* Create button */}
                      <button
                        onClick={() => handleCreate(template.id)}
                        disabled={createFromTemplate.isPending}
                        className={cn(
                          "w-full rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary border border-border hover:bg-accent"
                        )}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Создаём…
                          </>
                        ) : isSelected ? (
                          <>
                            <Check className="size-4" /> Создать
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-4" /> Использовать шаблон
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
