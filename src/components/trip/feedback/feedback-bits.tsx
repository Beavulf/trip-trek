import { cn } from "@/lib/utils";
import { FEEDBACK_STATUS_USER_LABEL, type FeedbackStatus } from "@/lib/feedback";

// Мелкие общие части окна обратной связи (форма, список, переписка)

const STATUS_CLS: Record<FeedbackStatus, string> = {
  new: "text-amber-500 border-amber-500/40 bg-amber-500/10",
  in_progress: "text-sky-500 border-sky-500/40 bg-sky-500/10",
  resolved: "text-emerald-500 border-emerald-500/40 bg-emerald-500/10",
};

export function StatusPill({ status }: { status: FeedbackStatus }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0",
        STATUS_CLS[status] ?? STATUS_CLS.new
      )}
    >
      {FEEDBACK_STATUS_USER_LABEL[status] ?? FEEDBACK_STATUS_USER_LABEL.new}
    </span>
  );
}

export function MonoLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80", className)}>{children}</p>
  );
}
