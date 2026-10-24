"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2, MessageSquareWarning, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FEEDBACK_TYPES, type FeedbackStatus, type FeedbackType } from "@/lib/feedback";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { FeedbackDetail } from "./FeedbackDetail";
import { relTime, StatusStamp, TYPE_META } from "./shared";

interface FeedbackListItem {
  id: string;
  type: FeedbackType;
  status: FeedbackStatus;
  message: string;
  hasScreenshot: boolean;
  contactEmail: string | null;
  user: { id: string; name: string; email: string; emoji: string; color: string } | null;
  lastActivityAt: string;
  createdAt: string;
  messagesCount: number;
  lastMessage: { author: "user" | "admin"; body: string };
}

interface FeedbackPage {
  items: FeedbackListItem[];
  nextCursor: string | null;
}

const FILTERS: { value: FeedbackStatus | "all"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "new", label: "Ждут ответа" },
  { value: "in_progress", label: "В работе" },
  { value: "resolved", label: "Закрытые" },
];

const TYPE_FILTERS: { value: FeedbackType | "all"; label: string }[] = [
  { value: "all", label: "Все типы" },
  ...FEEDBACK_TYPES.map((t) => ({ value: t, label: `${TYPE_META[t].emoji} ${TYPE_META[t].label}` })),
];

/** Широкий экран — детали рядом со списком; узкий — в шторке. */
function useIsWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return wide;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function FeedbackTab({
  statusFilter,
  onFilterChange,
  counts,
  initialOpenId = null,
}: {
  statusFilter: FeedbackStatus | "all";
  onFilterChange: (f: FeedbackStatus | "all") => void;
  counts: { new: number; inProgress: number; resolved: number };
  /** Обращение, которое надо открыть сразу (ссылка из уведомления «?open=») */
  initialOpenId?: string | null;
}) {
  const [typeFilter, setTypeFilter] = useState<FeedbackType | "all">("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [selectedId, setSelectedId] = useState<string | null>(initialOpenId);
  const wide = useIsWide();

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<FeedbackPage>({
    queryKey: ["admin-feedback", "list", statusFilter, typeFilter, q],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (q) params.set("q", q);
      if (pageParam) params.set("cursor", String(pageParam));
      const r = await fetch(`/api/admin/feedback${params.toString() ? `?${params}` : ""}`);
      if (!r.ok) throw new Error("fetch feedback failed");
      return r.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const countFor = (f: FeedbackStatus | "all") =>
    f === "all" ? counts.new + counts.inProgress + counts.resolved : f === "new" ? counts.new : f === "in_progress" ? counts.inProgress : counts.resolved;

  const detail = selectedId ? <FeedbackDetail key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} /> : null;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(320px,400px)_1fr] lg:gap-6 lg:items-start">
      <div className="space-y-3 min-w-0">
        {/* Поиск */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: текст, имя, email"
            aria-label="Поиск по обращениям"
            className="w-full min-h-11 rounded-2xl border border-border bg-card pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/70 input-mobile"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Очистить поиск"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 size-9 rounded-full grid place-items-center text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Фильтр статусов + тип */}
        <div className="space-y-1.5">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar chip-snap">
            {FILTERS.map((f) => {
              const n = countFor(f.value);
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => onFilterChange(f.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 min-h-9 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors",
                    statusFilter === f.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                  {n > 0 && (
                    <span
                      className={cn(
                        "min-w-4 h-4 px-1 rounded-full text-[9px] font-bold grid place-items-center",
                        statusFilter === f.value ? "bg-white/25 text-white" : "bg-primary/15 text-primary"
                      )}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar chip-snap">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setTypeFilter(f.value)}
                className={cn(
                  "px-2.5 min-h-8 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
                  typeFilter === f.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Очередь */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Не удалось загрузить обращения</p>
            <button type="button" onClick={() => void refetch()} className="min-h-11 px-5 rounded-2xl bg-secondary text-sm font-medium">
              Повторить
            </button>
          </div>
        ) : !items.length ? (
          <div className="py-16 text-center space-y-2">
            <div className="text-4xl">📮</div>
            <p className="text-sm text-muted-foreground">
              {q ? "Ничего не нашлось" : statusFilter === "all" && typeFilter === "all" ? "Обращений пока нет" : "В этой папке пусто"}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((f) => {
              const type = TYPE_META[f.type] || TYPE_META.bug;
              const waiting = f.status === "new";
              const active = f.id === selectedId;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(f.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "w-full text-left rounded-2xl border p-3.5 transition-colors hover:bg-accent/40",
                      active ? "border-primary/60 bg-primary/5" : "border-border bg-card"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{type.emoji}</span>
                      <span className="text-xs font-semibold truncate">{f.user ? f.user.name : "Гость"}</span>
                      <span className="flex-1" />
                      <StatusStamp status={f.status} />
                    </div>
                    <p className="text-sm mt-1.5 line-clamp-2 whitespace-pre-wrap break-words">
                      <span className="text-muted-foreground">{f.lastMessage.author === "admin" ? "Вы: " : ""}</span>
                      {f.lastMessage.body}
                    </p>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-1.5 flex items-center gap-1.5">
                      {waiting && <span className="size-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden />}
                      <span className="truncate">
                        {relTime(f.lastActivityAt)}
                        {f.messagesCount > 1 ? ` · ${f.messagesCount} сообщ.` : ""}
                        {f.hasScreenshot ? " · 📎" : ""}
                        {!f.user ? " · гость" : ""}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {hasNextPage && (
          <button
            type="button"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
            className="w-full min-h-11 rounded-2xl bg-secondary border border-border text-sm font-medium disabled:opacity-60"
          >
            {isFetchingNextPage ? <Loader2 className="size-4 animate-spin inline" /> : "Показать ещё"}
          </button>
        )}
      </div>

      {/* ПК: детали рядом со списком */}
      {wide && (
        <section className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto rounded-3xl border border-border bg-card p-5">
          {detail ?? (
            <div className="py-24 text-center space-y-2 text-muted-foreground">
              <MessageSquareWarning className="size-8 mx-auto opacity-60" />
              <p className="text-sm">Выберите обращение слева</p>
            </div>
          )}
        </section>
      )}

      {/* Телефон: детали в шторке */}
      {!wide && (
        <MobileBottomSheet
          open={!!selectedId}
          onOpenChange={(v) => !v && setSelectedId(null)}
          title="Обращение"
          titleIcon={<MessageSquareWarning className="size-4" />}
        >
          {detail}
        </MobileBottomSheet>
      )}
    </div>
  );
}
