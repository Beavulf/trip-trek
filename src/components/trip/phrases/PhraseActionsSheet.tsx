"use client";

// Шторка фразы: посмотреть крупно, послушать, скопировать, перевести —
// и отредактировать или удалить (фразы — общий ресурс поездки, как избранное).

import { useEffect, useState } from "react";
import { Volume2, Copy, ExternalLink, Expand, Trash2, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useUpdatePhrase,
  useDeletePhrase,
  type Phrase,
} from "@/hooks/use-trip";
import { googleTranslateUrl } from "@/lib/language-detect";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { BROWSE_CATEGORIES, pronunciationLabel } from "./constants";
import { buzz, speakPhrase, stopSpeaking } from "./shared";
import { detectLanguage } from "@/lib/language-detect";

export function PhraseActionsSheet({
  phrase,
  onOpenChange,
  onShowBig,
}: {
  phrase: Phrase | null;
  onOpenChange: (v: boolean) => void;
  onShowBig: (p: Phrase) => void;
}) {
  const open = !!phrase;
  const update = useUpdatePhrase();
  const del = useDeletePhrase();

  // Черновик полей — пересобираем при смене фразы
  const [ru, setRu] = useState("");
  const [foreign, setForeign] = useState("");
  const [pinyin, setPinyin] = useState("");
  const [category, setCategory] = useState("basics");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (phrase) {
      setRu(phrase.ru);
      setForeign(phrase.cn);
      setPinyin(phrase.pinyin);
      setCategory(phrase.category);
      setConfirmDelete(false);
    }
  }, [phrase]);

  if (!phrase) return null;
  const lang = detectLanguage(phrase.cn);
  const dirty = ru !== phrase.ru || foreign !== phrase.cn || pinyin !== phrase.pinyin || category !== phrase.category;
  const canSave = dirty && ru.trim() && foreign.trim();

  const save = () => {
    update.mutate(
      { id: phrase.id, ru, cn: foreign, pinyin, category },
      {
        onSuccess: () => {
          toast.success("Сохранено");
          buzz();
          onOpenChange(false);
        },
        onError: (e) => toast.error("Не удалось сохранить", { description: e instanceof Error ? e.message : undefined }),
      }
    );
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    del.mutate(
      { id: phrase.id },
      {
        onSuccess: () => {
          toast.success("Фраза удалена");
          onOpenChange(false);
        },
        onError: (e) => toast.error("Не удалось удалить", { description: e instanceof Error ? e.message : undefined }),
      }
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${phrase.cn}${phrase.pinyin ? ` (${phrase.pinyin})` : ""} — ${phrase.ru}`);
      buzz();
      toast.success("Скопировано");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={() => {
        stopSpeaking();
        onOpenChange(false);
      }}
      title="Фраза"
      titleIcon={<Pencil className="size-5 text-primary" />}
    >
      <div className="space-y-4">
        {/* Текущая фраза + быстрые действия */}
        <div className="text-center py-2">
          <p className="text-3xl font-bold break-words">{phrase.cn}</p>
          {phrase.pinyin && <p className="text-sm italic text-muted-foreground mt-1">{phrase.pinyin}</p>}
          <p className="text-sm text-foreground/75 mt-2">{phrase.ru}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{pronunciationLabel(lang.langPrefix)}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() =>
              speakPhrase(phrase.cn, { onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) })
            }
            className="min-h-11 rounded-xl bg-primary/10 text-primary text-xs font-medium inline-flex flex-col sm:flex-row items-center justify-center gap-1 active:scale-95 transition-transform"
          >
            <Volume2 className={cn("size-4", speaking && "animate-pulse")} /> Слушать
          </button>
          <button
            type="button"
            onClick={copy}
            className="min-h-11 rounded-xl bg-muted text-foreground text-xs font-medium inline-flex flex-col sm:flex-row items-center justify-center gap-1 active:scale-95 transition-transform"
          >
            <Copy className="size-4" /> Копировать
          </button>
          <a
            href={googleTranslateUrl(phrase.cn)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 rounded-xl bg-blue-500/10 text-blue-500 text-xs font-medium inline-flex flex-col sm:flex-row items-center justify-center gap-1 active:scale-95 transition-transform"
          >
            <ExternalLink className="size-4" /> Перевод
          </a>
        </div>

        <button
          type="button"
          onClick={() => {
            stopSpeaking();
            onOpenChange(false);
            onShowBig(phrase);
          }}
          className="w-full min-h-11 rounded-xl bg-indigo-600 text-white text-sm font-medium inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <Expand className="size-4" /> Показать крупно
        </button>

        {/* Правка */}
        <div className="border-t border-border pt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="phrase-ru">По-русски</label>
            <input
              id="phrase-ru"
              value={ru}
              onChange={(e) => setRu(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-base"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="phrase-cn">На языке</label>
            <input
              id="phrase-cn"
              value={foreign}
              onChange={(e) => setForeign(e.target.value)}
              maxLength={300}
              className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-base"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="phrase-py">Транскрипция</label>
            <input
              id="phrase-py"
              value={pinyin}
              onChange={(e) => setPinyin(e.target.value)}
              maxLength={200}
              placeholder="необязательно"
              className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-base"
            />
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground">Раздел</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {BROWSE_CATEGORIES.map((c) => {
                const activeCat = category === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    aria-pressed={activeCat}
                    className={cn(
                      "min-h-9 px-3 rounded-full text-xs font-medium border transition-colors",
                      activeCat ? "text-white border-transparent" : "bg-card border-border text-muted-foreground"
                    )}
                    style={activeCat ? { background: c.color } : undefined}
                  >
                    {c.emoji} {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {dirty && (
            <button
              type="button"
              onClick={save}
              disabled={!canSave || update.isPending}
              className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-medium inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {update.isPending && <Loader2 className="size-4 animate-spin" />} Сохранить изменения
            </button>
          )}

          <button
            type="button"
            onClick={remove}
            disabled={del.isPending}
            className={cn(
              "w-full min-h-11 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform",
              confirmDelete ? "bg-red-600 text-white" : "bg-red-500/10 text-red-500"
            )}
          >
            {del.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {confirmDelete ? "Точно удалить?" : "Удалить фразу"}
          </button>
          <p className="text-[10px] text-muted-foreground text-center">
            Фразы общие для всей компании — изменения видят все
          </p>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
