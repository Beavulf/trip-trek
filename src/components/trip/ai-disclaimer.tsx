"use client";

import { Sparkles } from "lucide-react";

// Дисклеймер ИИ-черновиков: одинаковая честная подпись на всех поверхностях
// (планер, подборки блюд, рестораны, прогулка). Текст меняется под контекст.

export function AiDisclaimer({ text, className }: { text?: string; className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground ${className ?? ""}`}>
      <Sparkles className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span>{text ?? "ИИ предлагает, а не гарантирует: часы работы и цены проверяйте сами."}</span>
    </p>
  );
}
