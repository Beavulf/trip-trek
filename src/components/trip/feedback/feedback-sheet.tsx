"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useMyFeedback } from "@/hooks/use-feedback";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { FeedbackForm } from "./feedback-form";
import { FeedbackList } from "./feedback-list";
import { FeedbackThread } from "./feedback-thread";

type View = "write" | "mine";

/**
 * Обратная связь: «Написать» (форма) и «Мои обращения» (список → переписка).
 * `initialId` открывает сразу переписку — так ведёт ссылка из уведомления об ответе.
 */
export function FeedbackSheet({
  open,
  onOpenChange,
  initialId = null,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialId?: string | null;
}) {
  const { data: session } = useAuth();
  const [view, setView] = useState<View>(initialId ? "mine" : "write");
  const [openId, setOpenId] = useState<string | null>(initialId);
  // После отправки форма показывает «спасибо»; при возврате на вкладку «Написать» нужна чистая
  const [formKey, setFormKey] = useState(0);
  // Счётчик на вкладке: общий кэш со списком, отдельного запроса не делает
  const { data: mine } = useMyFeedback(open && !!session?.user);
  const unread = mine?.unread ?? 0;

  const openThread = (id: string) => {
    setOpenId(id);
    setView("mine");
    setFormKey((k) => k + 1);
  };

  return (
    <MobileBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Обратная связь"
      titleIcon={<span>📮</span>}
      maxWidthClass="sm:max-w-lg"
    >
      {/* Переключатель разделов; внутри переписки прячем — там своя «назад» */}
      {!openId && (
        <div role="tablist" aria-label="Раздел" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-muted mb-4">
          {(
            [
              ["write", "Написать"],
              ["mine", "Мои обращения"],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "min-h-10 rounded-xl text-sm font-semibold transition-all inline-flex items-center justify-center gap-1.5",
                view === v ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              {v === "mine" && unread > 0 && (
                <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Форму не размонтируем при переходе в «Мои»: набранный текст не должен пропадать */}
      <div className={cn(view !== "write" && "hidden")}>
        <FeedbackForm key={formKey} onOpenThread={openThread} onDone={() => onOpenChange(false)} />
      </div>
      {view === "mine" &&
        (openId ? (
          <FeedbackThread id={openId} onBack={() => setOpenId(null)} />
        ) : (
          <FeedbackList onOpen={setOpenId} onWrite={() => setView("write")} />
        ))}
    </MobileBottomSheet>
  );
}
