"use client";

import { useAISummary, useTrip } from "@/hooks/use-trip";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Calendar, Lightbulb, BookHeart, Loader2, RefreshCw, Copy, Check } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SummaryType = "summary" | "day" | "tips";

const TYPES: Array<{ key: SummaryType; label: string; desc: string; icon: typeof Sparkles; color: string }> = [
  { key: "summary", label: "Итог поездки", desc: "Красивый отчёт всего путешествия", icon: BookHeart, color: "#f97316" },
  { key: "day", label: "Итог дня", desc: "Атмосферный итог сегодняшнего дня", icon: Calendar, color: "#06b6d4" },
  { key: "tips", label: "Советы", desc: "Практичные советы на оставшуюся поездку", icon: Lightbulb, color: "#8b5cf6" },
];

export function AISummary() {
  const { data: trip } = useTrip();
  const ai = useAISummary();
  const [activeType, setActiveType] = useState<SummaryType | null>(null);
  const [content, setContent] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const generate = async (type: SummaryType) => {
    setActiveType(type);
    setContent("");
    try {
      const res = await ai.mutateAsync({ type });
      setContent(res.content);
    } catch (e) {
      toast.error("Не удалось сгенерировать: " + (e as Error).message);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Скопировано в буфер");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4 animate-fade-up pb-20">
      {/* Hero */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-violet-600 via-fuchsia-500 to-orange-500 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -bottom-8 -right-4 text-[120px] opacity-15 select-none leading-none">✨</div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-1">
            <Sparkles className="size-4" /> AI-Итоги
          </div>
          <h1 className="text-2xl font-bold">Магия воспоминаний</h1>
          <p className="text-white/80 text-sm mt-1">Нейросеть создаст красивые итоги вашей поездки</p>
        </div>
      </div>

      {/* Типы генерации */}
      <div className="grid sm:grid-cols-3 gap-3">
        {TYPES.map((t) => {
          const Icon = t.icon;
          const active = activeType === t.key;
          const loading = ai.isPending && active;
          return (
            <button
              key={t.key}
              onClick={() => generate(t.key)}
              disabled={ai.isPending}
              className={cn(
                "relative rounded-2xl border-2 p-4 text-left transition-all overflow-hidden group disabled:opacity-60",
                active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40 hover:shadow-md"
              )}
            >
              {active && (
                <div
                  className="absolute inset-0 opacity-5"
                  style={{ background: `radial-gradient(circle at top right, ${t.color}, transparent 70%)` }}
                />
              )}
              <div className="relative flex items-start gap-3">
                <div
                  className="size-10 rounded-xl grid place-items-center shrink-0 transition-transform group-hover:scale-110"
                  style={{ background: `${t.color}22`, color: t.color }}
                >
                  {loading ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{t.desc}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Результат */}
      <AnimatePresence mode="wait">
        {content && (
          <motion.div
            key={activeType + content.slice(0, 20)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl bg-card border border-border overflow-hidden"
          >
            {/* header результата */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <span className="font-semibold text-sm">
                  {TYPES.find((t) => t.key === activeType)?.label}
                </span>
                <span className="text-xs text-muted-foreground">· AI-сгенерировано</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={copy}
                  className="size-8 rounded-lg hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Копировать"
                >
                  {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                </button>
                <button
                  onClick={() => activeType && generate(activeType)}
                  className="size-8 rounded-lg hover:bg-accent grid place-items-center text-muted-foreground hover:text-foreground transition-colors"
                  title="Обновить"
                >
                  <RefreshCw className="size-4" />
                </button>
              </div>
            </div>

            {/* контент */}
            <div className="p-4 sm:p-5 prose prose-sm dark:prose-invert max-w-none
              prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1.5
              prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
              prose-p:leading-relaxed prose-p:my-2
              prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2
              prose-strong:font-semibold
              prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
              prose-blockquote:border-l-primary prose-blockquote:not-italic prose-blockquote:text-muted-foreground
            ">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state когда ничего не сгенерировано */}
      {!content && !ai.isPending && (
        <div className="rounded-2xl border-2 border-dashed border-border py-12 text-center">
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="text-5xl mb-3"
          >
            🪄
          </motion.div>
          <p className="text-sm font-medium">Выберите тип итога выше</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            AI проанализирует ваши места, записи, траты и фото — и создаст красивый текст
          </p>
        </div>
      )}

      {/* Loading state */}
      {ai.isPending && !content && (
        <div className="rounded-2xl bg-card border border-border p-6 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Нейросеть анализирует вашу поездку…
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                className="h-3 bg-muted rounded"
                style={{ width: `${100 - i * 15}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Подсказка */}
      {trip && content && (
        <p className="text-xs text-muted-foreground text-center px-4">
          ✨ Сгенерировано на основе {trip.visitedPlaces} посещённых мест, {trip.totalPhotos} фото, {trip.totalJournals} записей и {trip.totalSpent.toFixed(0)}$ трат
        </p>
      )}
    </div>
  );
}
