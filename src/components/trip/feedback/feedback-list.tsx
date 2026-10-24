"use client";

import { Loader2, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyFeedback } from "@/hooks/use-feedback";
import { FEEDBACK_TYPE_META } from "@/lib/feedback";
import { relTime } from "@/components/admin/shared";
import { StatusPill } from "./feedback-bits";

/** «Мои обращения»: статус, свежая реплика и точка у обращений с непрочитанным ответом. */
export function FeedbackList({ onOpen, onWrite }: { onOpen: (id: string) => void; onWrite: () => void }) {
  const { data, isLoading, isError, refetch } = useMyFeedback(true);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-10 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Не удалось загрузить обращения</p>
        <button type="button" onClick={() => void refetch()} className="min-h-11 px-5 rounded-2xl bg-secondary text-sm font-medium">
          Повторить
        </button>
      </div>
    );
  }
  if (!data?.items.length) {
    return (
      <div className="py-10 text-center space-y-3">
        <div className="text-4xl">📮</div>
        <p className="text-sm font-medium">Пока ничего не отправляли</p>
        <p className="text-xs text-muted-foreground max-w-[16rem] mx-auto">Здесь будут ваши обращения и ответы на них.</p>
        <button
          type="button"
          onClick={onWrite}
          className="min-h-11 px-5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2"
        >
          <MessageSquarePlus className="size-4" />
          Написать
        </button>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {data.items.map((f) => {
        const meta = FEEDBACK_TYPE_META[f.type] ?? FEEDBACK_TYPE_META.bug;
        return (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onOpen(f.id)}
              className={cn(
                "w-full text-left rounded-2xl border p-3.5 transition-colors hover:bg-accent/40",
                f.unread ? "border-primary/50 bg-primary/5" : "border-border"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-base leading-none">{meta.emoji}</span>
                <span className="text-sm font-semibold">{meta.label}</span>
                {f.unread && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                    новый ответ
                  </span>
                )}
                <span className="flex-1" />
                <StatusPill status={f.status} />
              </div>
              <p className="mt-2 text-sm line-clamp-2 whitespace-pre-wrap break-words">
                <span className="text-muted-foreground">{f.preview.author === "admin" ? "TripTrek: " : "Вы: "}</span>
                {f.preview.body}
              </p>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
                {relTime(f.lastActivityAt)}
                {f.messagesCount > 1 ? ` · ${f.messagesCount} сообщ.` : ""}
                {f.screenshotUrl ? " · 📎" : ""}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
