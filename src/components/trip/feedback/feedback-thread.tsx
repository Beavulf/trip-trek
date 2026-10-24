"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFeedbackDetail, useReplyFeedback } from "@/hooks/use-feedback";
import { FEEDBACK_TYPE_META, MAX_REPLY } from "@/lib/feedback";
import { fmtDateTime } from "@/components/admin/shared";
import { StatusPill } from "./feedback-bits";

/** Переписка по одному обращению: пузыри «вы / команда» и поле «дописать». */
export function FeedbackThread({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading, isError, error } = useFeedbackDetail(id);
  const reply = useReplyFeedback(id);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const count = data?.thread.length ?? 0;

  // К свежему сообщению: при открытии и когда пришла/ушла реплика
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  const send = async () => {
    const body = text.trim();
    if (!body || reply.isPending) return;
    try {
      await reply.mutateAsync(body);
      setText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отправить");
    }
  };

  const meta = data ? FEEDBACK_TYPE_META[data.type] ?? FEEDBACK_TYPE_META.bug : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="К списку обращений"
          className="size-10 -ml-2 rounded-full hover:bg-accent grid place-items-center shrink-0"
        >
          <ArrowLeft className="size-4" />
        </button>
        {meta && (
          <span className="text-sm font-semibold">
            {meta.emoji} {meta.label}
          </span>
        )}
        <span className="flex-1" />
        {data && <StatusPill status={data.status} />}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {isError && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Не удалось открыть обращение"}
        </p>
      )}

      {data && (
        <>
          <div className="space-y-2.5">
            {data.thread.map((m, i) => {
              const mine = m.author === "user";
              return (
                <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words",
                      mine ? "bg-primary/15 rounded-br-md" : "bg-emerald-500/12 border border-emerald-500/20 rounded-bl-md"
                    )}
                  >
                    {!mine && (
                      <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-0.5">
                        TripTrek
                      </p>
                    )}
                    {m.body}
                    {i === 0 && data.screenshotUrl && (
                      <a href={data.screenshotUrl} target="_blank" rel="noreferrer" className="block mt-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={data.screenshotUrl} alt="Приложенный скриншот" className="rounded-xl max-h-48 w-auto border border-border" />
                      </a>
                    )}
                  </div>
                  <span className="mt-1 px-1 text-[10px] text-muted-foreground/80">{fmtDateTime(m.createdAt)}</span>
                </div>
              );
            })}
            {data.thread.length === 1 && data.status !== "resolved" && (
              <p className="text-center text-xs text-muted-foreground pt-1">Мы получили сообщение. Ответ появится здесь и в колокольчике 🔔</p>
            )}
            <div ref={endRef} />
          </div>

          {/* Дописать: закрытое обращение это не запрещает, а возвращает в работу */}
          <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-3 pb-3 bg-gradient-to-t from-card from-70% to-transparent space-y-2">
            {data.status === "resolved" && (
              <p className="text-xs text-muted-foreground text-center">Обращение закрыто. Не помогло? Напишите — откроем снова.</p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                maxLength={MAX_REPLY}
                placeholder="Дописать…"
                aria-label="Ответить"
                className="flex-1 rounded-2xl border border-border bg-background px-3.5 py-2.5 text-sm resize-none max-h-32 focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/70 input-mobile"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={!text.trim() || reply.isPending}
                aria-label="Отправить"
                className="size-12 shrink-0 rounded-2xl bg-primary text-primary-foreground grid place-items-center active:scale-95 transition-transform disabled:opacity-45 disabled:pointer-events-none"
              >
                {reply.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
