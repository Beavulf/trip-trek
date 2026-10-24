"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Loader2, Mail, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  describeScreen,
  describeUserAgent,
  MAX_REPLY,
  QUICK_REPLIES,
  type FeedbackStatus,
  type FeedbackType,
} from "@/lib/feedback";
import type { FeedbackMessageDto } from "@/lib/feedback-server";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtDateTime, STATUS_META, StatusStamp, TYPE_META } from "./shared";

export interface FeedbackDetailData {
  id: string;
  type: FeedbackType;
  status: FeedbackStatus;
  message: string;
  screenshotUrl: string | null;
  adminNote: string | null;
  screen: string | null;
  pageUrl: string | null;
  tripId: string | null;
  trip: { id: string; title: string } | null;
  userAgent: string | null;
  viewport: string | null;
  appVersion: string | null;
  contactEmail: string | null;
  createdAt: string;
  lastActivityAt: string;
  resolvedAt: string | null;
  authorTotal: number;
  user: { id: string; name: string; email: string; emoji: string; color: string; plan: string; createdAt: string } | null;
  thread: FeedbackMessageDto[];
}

const LABEL = "font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70";

async function call<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const r = await fetch(url, init);
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((json as { error?: string }).error || fallback);
  return json as T;
}

/**
 * Обращение целиком: автор, переписка, ответ (с быстрыми заготовками), статус, заметка, контекст.
 * Живёт и в правой панели на ПК, и в шторке на телефоне — снаружи различается только рамка.
 */
export function FeedbackDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  // null — заметку не трогали: показываем серверную; снаружи панель монтируется с key=id, поэтому между обращениями состояние не течёт
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, error } = useQuery<FeedbackDetailData>({
    queryKey: ["admin-feedback", "detail", id],
    queryFn: () => call(`/api/admin/feedback/${id}`, {}, "Не удалось открыть обращение"),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const count = data?.thread.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-feedback"] });
    void qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      call("/api/admin/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) }, "Не удалось сохранить"),
    onSuccess: (_r, vars) => {
      if ("adminNote" in vars) {
        setNoteDraft(null);
        toast.success("Заметка сохранена");
      }
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: (opts: { body: string; status?: FeedbackStatus }) =>
      call<{ emailed: boolean | null }>(
        `/api/admin/feedback/${id}/messages`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(opts) },
        "Не удалось отправить"
      ),
    onSuccess: (res) => {
      setReply("");
      refresh();
      if (res.emailed === true) toast.success("Ответ отправлен письмом");
      else if (res.emailed === false) toast.warning("Почта не настроена — ответ сохранён, но гостю не ушёл. Напишите ему вручную");
      else toast.success("Ответ отправлен — придёт в колокольчик");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => call(`/api/admin/feedback?id=${id}`, { method: "DELETE" }, "Не удалось удалить"),
    onSuccess: () => {
      setConfirmDelete(false);
      refresh();
      onClose();
      toast.success("Обращение удалено");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-7 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !data) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{error instanceof Error ? error.message : "Не удалось открыть обращение"}</p>;
  }

  const type = TYPE_META[data.type] || TYPE_META.bug;
  const note = noteDraft ?? data.adminNote ?? "";
  const noteDirty = noteDraft !== null;
  const isGuest = !data.user;
  const device = describeUserAgent(data.userAgent);
  const canSend = reply.trim().length > 0 && !send.isPending;
  const submit = (status?: FeedbackStatus) => {
    if (!canSend) return;
    send.mutate({ body: reply.trim(), status });
  };

  const contextRows: [string, string | null][] = [
    ["где", describeScreen(data.screen) ?? data.pageUrl],
    ["устройство", device],
    ["окно", data.viewport],
    ["версия", data.appVersion],
    ["поездка", data.trip?.title ?? (data.tripId ? "удалена" : null)],
    ["отправлено", fmtDateTime(data.createdAt)],
  ];

  return (
    <div className="space-y-4">
      {/* Шапка: тип, статус, автор */}
      <div className="flex items-center gap-2">
        <span className="text-xl leading-none">{type.emoji}</span>
        <span className="font-semibold">{type.label}</span>
        <span className="flex-1" />
        <StatusStamp status={data.status} />
      </div>

      <div className="rounded-2xl bg-secondary/50 p-3 flex items-center gap-3">
        <span
          className="size-10 rounded-full grid place-items-center text-lg shrink-0"
          style={{ background: data.user ? `${data.user.color}26` : undefined }}
          aria-hidden
        >
          {data.user?.emoji ?? "👤"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{data.user?.name ?? "Гость"}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground truncate">
            {data.user?.email ?? data.contactEmail}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {data.user
              ? `${data.authorTotal > 1 ? `обращений: ${data.authorTotal} · ` : ""}${data.user.plan === "premium" ? "Premium · " : ""}с нами с ${new Date(data.user.createdAt).toLocaleDateString("ru-RU")}`
              : "без аккаунта (форма на странице входа)"}
          </p>
        </div>
        {isGuest && data.contactEmail && (
          <a
            href={`mailto:${data.contactEmail}`}
            className="size-10 rounded-full bg-secondary border border-border grid place-items-center hover:bg-accent shrink-0"
            aria-label="Написать письмом"
          >
            <Mail className="size-4" />
          </a>
        )}
      </div>

      {/* Переписка: автор слева, мы справа */}
      <div className="space-y-2.5">
        {data.thread.map((m, i) => {
          const admin = m.author === "admin";
          return (
            <div key={m.id} className={cn("flex flex-col", admin ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words",
                  admin ? "bg-emerald-500/12 border border-emerald-500/20 rounded-br-md" : "bg-secondary rounded-bl-md"
                )}
              >
                {m.body}
                {i === 0 && data.screenshotUrl && (
                  <a href={data.screenshotUrl} target="_blank" rel="noreferrer" className="relative block mt-2 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={data.screenshotUrl} alt="Скриншот" className="rounded-xl max-h-64 w-auto border border-border" />
                    <span className="absolute bottom-2 right-2 size-8 rounded-full bg-black/60 text-white grid place-items-center backdrop-blur group-hover:bg-black/80">
                      <ExternalLink className="size-3.5" />
                    </span>
                  </a>
                )}
              </div>
              <span className="mt-1 px-1 text-[10px] text-muted-foreground/80">
                {admin ? "вы · " : ""}
                {fmtDateTime(m.createdAt)}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Ответ */}
      <div className="space-y-2">
        <p className={LABEL}>{isGuest ? "ответ гостю (уйдёт письмом)" : "ответ пользователю (придёт в колокольчик)"}</p>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar chip-snap pb-0.5">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setReply((cur) => (cur.trim() ? `${cur.trimEnd()}\n${q.text}` : q.text))}
              className="px-2.5 min-h-8 rounded-lg border border-border bg-card text-xs font-medium whitespace-nowrap shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {q.label}
            </button>
          ))}
        </div>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={4}
          maxLength={MAX_REPLY}
          placeholder="Напишите ответ… (Ctrl+Enter — отправить)"
          aria-label="Ответ"
          className="w-full rounded-2xl border border-border bg-background px-3.5 py-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 input-mobile"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!canSend}
            onClick={() => submit()}
            className="min-h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45 active:scale-[0.98] transition-all"
          >
            {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Ответить
          </button>
          <button
            type="button"
            disabled={!canSend || data.status === "resolved"}
            onClick={() => submit("resolved")}
            className="min-h-11 rounded-2xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-45 active:scale-[0.98] transition-all"
          >
            Ответить и закрыть
          </button>
        </div>
      </div>

      {/* Статус */}
      <div>
        <p className={cn(LABEL, "mb-1.5")}>статус</p>
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted">
          {(["new", "in_progress", "resolved"] as FeedbackStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              disabled={patch.isPending}
              onClick={() => data.status !== s && patch.mutate({ status: s })}
              className={cn(
                "min-h-10 rounded-xl text-xs font-semibold transition-all disabled:opacity-50",
                data.status === s ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
        {data.resolvedAt && <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/80 mt-1.5">закрыт {fmtDateTime(data.resolvedAt)}</p>}
      </div>

      {/* Заметка админа */}
      <div>
        <p className={cn(LABEL, "mb-1.5")}>заметка (видна только админам)</p>
        <textarea
          value={note}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Что сделал, что решил…"
          aria-label="Заметка админа"
          className="w-full rounded-2xl border border-border bg-background px-3.5 py-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 input-mobile"
        />
        {noteDirty && (
          <button
            type="button"
            disabled={patch.isPending}
            onClick={() => patch.mutate({ adminNote: note })}
            className="mt-2 w-full min-h-10 rounded-2xl bg-secondary border border-border text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {patch.isPending ? <Loader2 className="size-4 animate-spin inline" /> : "Сохранить заметку"}
          </button>
        )}
      </div>

      {/* Контекст для разбора багов */}
      <details className="group rounded-2xl bg-secondary/40">
        <summary className="flex items-center gap-2 px-3.5 min-h-11 cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
          Сведения об отправке
          <ChevronDown className="size-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <dl className="px-3.5 pb-3 space-y-1">
          {contextRows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex gap-3 text-xs">
                <dt className="w-20 shrink-0 font-mono uppercase tracking-widest text-[10px] text-muted-foreground pt-0.5">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          {!device && !data.screen && !data.viewport && (
            <p className="text-xs text-muted-foreground">Автор не прикладывал сведения об устройстве.</p>
          )}
        </dl>
      </details>

      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => setConfirmDelete(true)}
        className="w-full min-h-11 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 text-sm font-medium flex items-center justify-center gap-2 hover:bg-destructive/20 transition-colors disabled:opacity-50"
      >
        <Trash2 className="size-4" />
        Удалить обращение
      </button>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить обращение?</AlertDialogTitle>
            <AlertDialogDescription>
              Вместе с перепиской и скриншотом. Автор потеряет его в «Моих обращениях». Это нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
