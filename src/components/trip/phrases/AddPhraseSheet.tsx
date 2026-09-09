"use client";

// Шторка «Своя фраза»: в другой стране человек часто НЕ знает местного языка —
// поэтому «На языке» необязательно: ✨ Перевести (ИИ) заполнит его и транскрипцию.
// Фразы общие для всей поездки, как и избранное.

import { useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreatePhrase, useAiTranslate } from "@/hooks/use-trip";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { BROWSE_CATEGORIES } from "./constants";
import { buzz } from "./shared";

export function AddPhraseSheet({
  open,
  onOpenChange,
  tripId,
  defaultCategory = "basics",
  /** Язык поездки: код (zh) + человеческое имя для промпта */
  language,
  languageName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tripId: string;
  defaultCategory?: string;
  language?: string;
  languageName?: string;
}) {
  const create = useCreatePhrase();
  const ai = useAiTranslate();
  const [ru, setRu] = useState("");
  const [foreign, setForeign] = useState("");
  const [pinyin, setPinyin] = useState("");
  const [category, setCategory] = useState(defaultCategory);

  const close = (v: boolean) => {
    if (!v) {
      setRu("");
      setForeign("");
      setPinyin("");
      setCategory(defaultCategory);
    }
    onOpenChange(v);
  };

  const canSave = ru.trim() && tripId && !create.isPending;
  const canTranslate = ru.trim() && !ai.isPending;

  /** Перевести через ИИ и подставить в поля (пользователь может поправить) */
  const translate = async () => {
    if (!canTranslate) return;
    try {
      const t = await ai.mutateAsync({ tripId, text: ru, language, languageName });
      setForeign(t.cn);
      setPinyin(t.pinyin || "");
      buzz();
      toast.success("Переведено — проверь и жми «Добавить»");
    } catch (e) {
      toast.error("Не удалось перевести", {
        description: e instanceof Error ? e.message : "Введи фразу на языке вручную",
      });
    }
  };

  /** Сохранить; если «на языке» пусто — сначала перевод тем же ИИ */
  const save = async () => {
    if (!canSave) return;
    try {
      let cn = foreign.trim();
      let py = pinyin.trim();
      if (!cn) {
        const t = await ai.mutateAsync({ tripId, text: ru, language, languageName });
        cn = t.cn;
        py = py || t.pinyin || "";
      }
      await create.mutateAsync({ tripId, ru, cn, pinyin: py, category, language: language || undefined });
      toast.success("Фраза в разговорнике");
      buzz(12);
      close(false);
    } catch (e) {
      toast.error("Не удалось добавить", { description: e instanceof Error ? e.message : "Попробуй ещё раз" });
    }
  };

  return (
    <MobileBottomSheet open={open} onOpenChange={close} title="Своя фраза" titleIcon={<Plus className="size-5 text-primary" />}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="add-ru">По-русски *</label>
          <input
            id="add-ru"
            value={ru}
            onChange={(e) => setRu(e.target.value)}
            maxLength={200}
            placeholder="Довезите до отеля, пожалуйста"
            className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-base"
          />
          <button
            type="button"
            onClick={translate}
            disabled={!canTranslate}
            className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-indigo-600/10 px-3 text-xs font-medium text-indigo-600 active:scale-95 transition-transform disabled:opacity-40"
          >
            {ai.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {ai.isPending ? "Переводим…" : languageName ? `Перевести на ${languageName.toLowerCase()}` : "Перевести через ИИ"}
          </button>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="add-cn">
            На языке <span className="text-muted-foreground/60">(пусто — переведём сами)</span>
          </label>
          <input
            id="add-cn"
            value={foreign}
            onChange={(e) => setForeign(e.target.value)}
            maxLength={300}
            placeholder="请送我到酒店"
            className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-base"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="add-py">Транскрипция</label>
          <input
            id="add-py"
            value={pinyin}
            onChange={(e) => setPinyin(e.target.value)}
            maxLength={200}
            placeholder="qing song wo dao jiudian"
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
        <button
          type="button"
          onClick={save}
          disabled={!canSave || create.isPending || ai.isPending}
          className="w-full min-h-12 rounded-xl bg-primary text-primary-foreground font-medium inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {create.isPending || ai.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {ai.isPending && !foreign.trim() ? "Переводим и добавляем…" : "Добавить в разговорник"}
        </button>
        <p className="text-[10px] text-muted-foreground text-center">
          Фраза появится у всех участников поездки · ИИ может ошибиться — проверь перевод
        </p>
      </div>
    </MobileBottomSheet>
  );
}
