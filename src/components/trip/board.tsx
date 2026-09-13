"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  Copy,
  CornerUpLeft,
  Loader2,
  LogIn,
  Pencil,
  Pin,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn, plural } from "@/lib/utils";
import { useTripStore } from "@/lib/trip-store";
import {
  useBoard,
  useAddBoardMessage,
  useEditBoardMessage,
  useToggleBoardReaction,
  useTogglePinBoard,
  useDeleteBoardMessage,
  useTrip,
  useCurrentTripId,
  type BoardMessage,
} from "@/hooks/use-trip";
import { useAuth } from "@/hooks/use-auth";
import { getSocket, SOCKET_READY_EVENT } from "@/hooks/use-websocket";

/* Быстрые «штампы» — тап отправляет эмодзи сообщением, без клавиатуры */
const STAMPS = ["👍", "😂", "❤️", "🔥", "🎉", "🤔"];
/* Набор реакций в шторке сообщения */
const REACTIONS = ["👍", "❤️", "😂", "🔥", "😮", "😢"];
const MAX_LEN = 4000;
/* Δ между сообщениями одного автора, после которого снова показываем шапку */
const GROUP_GAP_MS = 5 * 60 * 1000;
/* Промпты пустого чата — тап подставляет текст в композер */
const STARTERS = ["Выехали! 🚗", "Кто уже на месте?", "План на вечер?"] as const;

const URL_SPLIT = /(https?:\/\/[^\s<>"')\]]+)/g;
const isUrl = (s: string) => /^https?:\/\//.test(s);
/* Сообщение из одних эмодзи печатаем крупно (штампы так живут в ленте) */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\s){1,8}$/u;

const hhmm = (ts: string) => {
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};

function dayLabel(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (same(d, now)) return "Сегодня";
  if (same(d, yesterday)) return "Вчера";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("ru-RU", opts);
}

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* нет поддержки — не страшно */
  }
}

export function Board() {
  const tripId = useCurrentTripId();
  const { data: messages, isLoading, error: messagesError, refetch: refetchMessages } = useBoard();
  const { data: trip, error: tripError, refetch: refetchTrip } = useTrip();
  const { data: session } = useAuth();
  const { setActiveTab } = useTripStore();

  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";

  if (!tripId) {
    return (
      <div className="space-y-4 animate-fade-up pb-20">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl text-center">
          <div className="text-5xl mb-3">💬</div>
          <h1 className="text-xl font-bold">Нет активной поездки</h1>
          <p className="text-white/80 text-sm mt-1">Создай или присоединись к поездке</p>
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className="mt-4 rounded-xl bg-white/20 backdrop-blur px-4 py-3 text-sm font-medium active:scale-95 min-h-11"
          >
            На главную →
          </button>
        </div>
      </div>
    );
  }

  if (tripError) {
    return (
      <Centered>
        <div className="text-3xl">🤔</div>
        <p className="text-sm font-medium">Не удалось загрузить поездку</p>
        <Retry onClick={() => refetchTrip()} />
      </Centered>
    );
  }
  if (messagesError) {
    return (
      <Centered>
        <div className="text-3xl">💬</div>
        <p className="text-sm font-medium">Не удалось загрузить чат</p>
        <Retry onClick={() => refetchMessages()} />
      </Centered>
    );
  }

  return (
    <ChatDock
      tripId={tripId}
      messages={messages ?? []}
      isLoading={isLoading}
      trip={trip}
      currentUserId={currentUserId}
      sessionUserName={(session?.user as { name?: string } | undefined)?.name}
    />
  );
}

/* ==================================================================== */

type TripData = NonNullable<ReturnType<typeof useTrip>["data"]>;

function ChatDock({
  tripId,
  messages,
  isLoading,
  trip,
  currentUserId,
  sessionUserName,
}: {
  tripId: string;
  messages: BoardMessage[];
  isLoading: boolean;
  trip?: TripData;
  currentUserId: string;
  sessionUserName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const add = useAddBoardMessage();
  const editMsg = useEditBoardMessage();
  const toggleReaction = useToggleBoardReaction();
  const togglePin = useTogglePinBoard();
  const del = useDeleteBoardMessage();

  const listRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const atBottomRef = useRef(true);
  const initScrolledRef = useRef(false);
  const lastTypingSentRef = useRef(0);

  // Композер
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<BoardMessage | null>(null);
  const [editing, setEditing] = useState<BoardMessage | null>(null);
  // Шапка
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pinnedOpen, setPinnedOpen] = useState(true);
  // Меню сообщения: якорится над пузырём (id + снимок геометрии на момент клика)
  const [menu, setMenu] = useState<{ id: string; rect: DOMRect; own: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Свежее сообщение для открытого меню (после рефетча реакции/правки видны)
  const menuMsg = useMemo(
    () => (menu ? messages.find((m) => m.id === menu.id) ?? null : null),
    [menu, messages]
  );
  useEffect(() => {
    if (menu && !menuMsg) setMenu(null); // сообщение удалили — меню не нужно
  }, [menu, menuMsg]);
  // Подсветка при переходе к сообщению
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // «Печатает…»
  const [typing, setTyping] = useState<Record<string, number>>({});
  // Новые сообщения, пока лента прокручена вверх
  const [newCount, setNewCount] = useState(0);
  // Порционный рендер (аудит 2026-09-13): история до 1000 сообщений целиком
  // в DOM на мобильном = секунды маунта и джанки на каждом WS-инвалиде
  const [renderLimit, setRenderLimit] = useState(100);

  const participants = trip?.participants ?? [];
  const me = participants.find((p) => p.id === currentUserId);
  const myRole = me?.role ?? null;
  const author = me
    ? { id: me.id, name: me.name, color: me.color, emoji: me.emoji }
    : currentUserId
      ? { id: currentUserId, name: sessionUserName || "Я", color: "#94a3b8", emoji: "👤" }
      : null;

  const isCoarse = useRef(false);
  useEffect(() => {
    isCoarse.current = window.matchMedia("(pointer: coarse)").matches;
  }, []);

  /* Автовысота textarea при наборе */
  useEffect(() => {
    if (taRef.current) fitTextarea(taRef.current);
  }, [content]);

  /* Чат занимает экран под шапкой приложения; FAB и футер прячутся через body.chat-dock */
  useEffect(() => {
    document.body.classList.add("chat-dock");
    return () => document.body.classList.remove("chat-dock");
  }, []);

  /* Высота дока: от фактического верха дока до низа экрана.
     Меряем сам dock (а не шапку): обёртка вкладки анимируется (y: 8→0),
     и в застрявшем состоянии шапочная математика даёт overflow. */
  const [dockH, setDockH] = useState<number | null>(null);
  useEffect(() => {
    let raf = 0;
    let last = -1;
    let stable = 0;
    const tick = () => {
      const el = dockRef.current;
      if (el) {
        const top = el.getBoundingClientRect().top;
        let h = Math.max(320, window.innerHeight - top);
        // Если страница всё же переполнена (обёртка вкладки застряла в анимации) — сжимаем
        const overflow = document.documentElement.scrollHeight - window.innerHeight;
        if (overflow > 0) h = Math.max(320, h - overflow);
        if (Math.abs(h - last) < 0.5) stable += 1;
        else stable = 0;
        last = h;
        setDockH(h);
      }
      if (stable < 3) raf = requestAnimationFrame(tick);
    };
    tick();
    const onResize = () => {
      stable = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  /* iOS: клавиатура не сжимает 100dvh — компенсируем через visualViewport */
  const scrollToBottom = (behavior: ScrollBehavior) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };
  useEffect(() => {
    const vv = window.visualViewport;
    const dock = dockRef.current;
    if (!vv || !dock) return;
    const update = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      dock.style.paddingBottom = overlap > 0 ? `${Math.round(overlap)}px` : "";
      if (atBottomRef.current) scrollToBottom("auto");
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      dock.style.paddingBottom = "";
    };
  }, []);

  /* Черновик на поездку (как в Дневнике) */
  const draftKey = `tt-chat-draft-${tripId}`;
  useEffect(() => {
    let d = "";
    try {
      d = localStorage.getItem(draftKey) ?? "";
    } catch {
      /* ignore */
    }
    setContent(d);
    setReplyTo(null);
    setEditing(null);
     
  }, [draftKey]);
  useEffect(() => {
    try {
      if (content.trim()) localStorage.setItem(draftKey, content);
      else localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [content, draftKey]);

  /* Автоскролл: при входе — мгновенно вниз; дальше — если мы у дна */
  useEffect(() => {
    const el = listRef.current;
    if (!el || isLoading) return;
    if (!initScrolledRef.current) {
      initScrolledRef.current = true;
      const t = window.setTimeout(() => scrollToBottom("auto"), 30);
      return () => window.clearTimeout(t);
    }
    if (atBottomRef.current) {
      const t = window.setTimeout(() => scrollToBottom(reduceMotion ? "auto" : "smooth"), 30);
      return () => window.clearTimeout(t);
    }
    setNewCount((c) => c + 1);
     
  }, [messages.length, isLoading]);

  const onListScroll = () => {
    // прокрутка ленты закрывает меню сообщения (оно якорится к экрану, не к ленте)
    if (menu) closeMenu();
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    atBottomRef.current = near;
    if (near && newCount !== 0) setNewCount(0);
  };

  /* «Печатает…»: шлём троттленно, принимаем — в карту с таймштампами */
  const handleType = (v: string) => {
    setContent(v);
    const s = getSocket();
    const now = Date.now();
    if (s && v.trim() && currentUserId && now - lastTypingSentRef.current > 2500) {
      lastTypingSentRef.current = now;
      s.emit("board:typing", { tripId, userName: author?.name });
    }
  };
  useEffect(() => {
    // Подписка переживает пересоздание сокета: attach перевешивается на новый
    // инстанс по событию SOCKET_READY_EVENT (аудит 2026-09-13 — «печатает» умирал
    // после смены поездки/реконнекта, когда эффект с []-deps держал старый сокет)
    let s = getSocket();
    const handler = (d: { userName?: string }) => {
      if (!d?.userName) return;
      setTyping((prev) => ({ ...prev, [d.userName as string]: Date.now() }));
    };
    const attach = () => {
      const fresh = getSocket();
      if (fresh && fresh !== s) {
        s?.off("board:typing", handler);
        s = fresh;
      }
      s?.on("board:typing", handler);
    };
    attach();
    window.addEventListener(SOCKET_READY_EVENT, attach);
    return () => {
      window.removeEventListener(SOCKET_READY_EVENT, attach);
      s?.off("board:typing", handler);
    };
  }, [tripId]);
  useEffect(() => {
    const t = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, ts]) => now - ts < 3000));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const typingNames = Object.keys(typing);

  /* Поиск по содержимому */
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const visible = useMemo(
    () => (searching ? messages.filter((m) => m.content.toLowerCase().includes(q)) : messages),
    [messages, q, searching]
  );
  // Рендерим последние renderLimit сообщений; «Показать ещё» открывает более ранние
  const rendered = useMemo(
    () => (visible.length > renderLimit ? visible.slice(visible.length - renderLimit) : visible),
    [visible, renderLimit]
  );
  const pinned = useMemo(() => messages.filter((m) => m.pinned), [messages]);

  const jumpTo = useCallback((id: string) => {
    if (searching) {
      setSearchOpen(false);
      setQuery("");
    }
    const scrollAndFlash = () => {
      const el = document.getElementById(`msg-${id}`);
      if (!el) return false;
      el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      setHighlightId(id);
      window.setTimeout(() => setHighlightId(null), 1900);
      return true;
    };
    // setTimeout вместо rAF: работает и в фоновой вкладке
    window.setTimeout(() => {
      // Сообщение может не быть отрендерено (порционный рендер длинной истории) —
      // тогда показываем всю историю и скроллим повторно
      if (!scrollAndFlash()) {
        setRenderLimit(Number.MAX_SAFE_INTEGER);
        window.setTimeout(scrollAndFlash, 120);
      }
    }, 60);
  }, [searching, reduceMotion]);

  const send = async (override?: string) => {
    const raw = override ?? content;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (!currentUserId || !author) {
      toast.error("Войдите, чтобы писать в чат");
      return;
    }
    if (trimmed.length > MAX_LEN) {
      toast.error(`Слишком длинное сообщение (макс ${MAX_LEN} символов)`);
      return;
    }
    if (editing) {
      try {
        await editMsg.mutateAsync({ id: editing.id, content: trimmed });
        setEditing(null);
        setContent("");
        setReplyTo(null);
        vibrate(8);
      } catch (err) {
        toast.error("Не удалось сохранить", {
          description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        });
      }
      return;
    }
    try {
      await add.mutateAsync({
        content: trimmed,
        replyToId: replyTo?.id ?? null,
        author,
      });
      setContent("");
      setReplyTo(null);
      vibrate(10);
      atBottomRef.current = true;
      setNewCount(0);
      window.setTimeout(() => scrollToBottom(reduceMotion ? "auto" : "smooth"), 30);
    } catch (err) {
      // Черновик остаётся — пользователь не теряет текст
      toast.error("Не удалось отправить", {
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
      });
    }
  };

  const canDelete = (m: BoardMessage) => m.userId === currentUserId || myRole === "owner";

  const openMenu = useCallback((m: BoardMessage, rect: DOMRect, own: boolean) => {
    setConfirmDelete(false);
    setMenu({ id: m.id, rect, own });
  }, []);

  // Стабильный колбэк: MessageRow обёрнут в memo, инлайн-стрелки обесценили бы его
  const handleToggleReaction = useCallback(
    (m: BoardMessage, emoji: string) => {
      vibrate(8);
      toggleReaction.mutate(
        { id: m.id, reaction: emoji },
        {
          onError: (err) =>
            toast.error("Не удалось поставить реакцию", {
              description: err instanceof Error ? err.message : "Попробуйте ещё раз",
            }),
        }
      );
    },
    [toggleReaction]
  );

  const closeMenu = () => {
    setMenu(null);
    setConfirmDelete(false);
  };

  return (
    <div
      ref={dockRef}
      className="flex flex-col min-h-0"
      style={{ height: dockH ?? "calc(100dvh - var(--app-header-offset) - 1rem - 6px)" }}
    >
      {/* Шапка чата */}
      <div className="flex items-center gap-2 px-1 pt-1 pb-2 shrink-0">
        <div className="min-w-0">
          <h1 className="text-base font-bold leading-tight flex items-center gap-1.5">
            💬 Чат
            {trip?.trip?.title && (
              <span className="text-[11px] font-medium text-muted-foreground truncate max-w-[32vw]">
                · {trip.trip.title}
              </span>
            )}
          </h1>
          <div className="text-[11px] text-muted-foreground leading-tight">
            {messages.length > 0 ? (
              <>
                {messages.length} {plural(messages.length, "сообщение", "сообщения", "сообщений")}
                {pinned.length > 0 && ` · 📌 ${pinned.length}`}
              </>
            ) : (
              "группа на связи"
            )}
          </div>
        </div>
        <div className="flex-1" />
        {/* Кто в поездке */}
        <div className="flex items-center -space-x-1.5" title="Участники">
          {participants.slice(0, 4).map((p) => (
            <div
              key={p.id}
              className="size-6 rounded-full grid place-items-center text-[10px] border-2 border-background shrink-0"
              style={{ background: p.color }}
              title={p.name}
            >
              {p.emoji}
            </div>
          ))}
          {participants.length > 4 && (
            <div className="size-6 rounded-full grid place-items-center text-[9px] font-bold bg-muted border-2 border-background text-muted-foreground">
              +{participants.length - 4}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setQuery("");
          }}
          aria-label="Поиск по чату"
          aria-expanded={searchOpen}
          className={cn(
            "btn-icon-touch shrink-0 transition-colors",
            searchOpen ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
          )}
        >
          <Search className="size-4.5" />
        </button>
      </div>

      {/* Поиск */}
      <AnimatePresence initial={false}>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden shrink-0"
          >
            <div className="flex items-center gap-2 rounded-2xl bg-card border border-border px-3 py-2 mb-1">
              <Search className="size-4 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && (setQuery(""), setSearchOpen(false))}
                placeholder="Найти в чате…"
                className="flex-1 bg-transparent outline-none text-sm input-mobile min-w-0"
                aria-label="Поиск по чату"
              />
              {searching && (
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {visible.length} {plural(visible.length, "совпадение", "совпадения", "совпадений")}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSearchOpen(false);
                }}
                aria-label="Закрыть поиск"
                className="btn-icon-touch size-8 text-muted-foreground hover:bg-accent shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Рельса закреплённых */}
      {pinned.length > 0 && (
        <div className="shrink-0 mb-1">
          <button
            type="button"
            onClick={() => setPinnedOpen((v) => !v)}
            className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
            aria-expanded={pinnedOpen}
          >
            <Pin className="size-3" />
            Закреплённые · {pinned.length}
            <ChevronDown className={cn("size-3.5 transition-transform", pinnedOpen && "rotate-180")} />
          </button>
          {pinnedOpen && (
            <div className="chip-rail no-scrollbar px-1">
              {pinned.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => jumpTo(m.id)}
                  className="max-w-[220px] text-left rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 active:scale-95 transition-transform"
                >
                  <span className="text-[11px] font-semibold block truncate" style={{ color: m.user?.color }}>
                    {m.user?.name ?? "Аноним"}
                  </span>
                  <span className="text-[11px] text-muted-foreground block truncate">{m.content}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Лента */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={listRef}
          onScroll={onListScroll}
          role="log"
          aria-label="Сообщения чата"
          className="h-full overflow-y-auto overscroll-contain px-0.5 pb-2"
        >
          {isLoading ? (
            <ChatSkeleton />
          ) : visible.length === 0 ? (
            searching ? (
              <Centered>
                <div className="text-3xl">🔍</div>
                <p className="text-sm text-muted-foreground">Ничего не нашлось</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Попробуйте другое слово</p>
              </Centered>
            ) : (
              <EmptyChat
                canWrite={!!currentUserId}
                onStarter={(s) => {
                  setContent(s);
                  taRef.current?.focus();
                }}
              />
            )
          ) : (
            <div className="max-w-3xl mx-auto space-y-0.5">
              {!searching && rendered.length < visible.length && (
                <div className="flex justify-center py-2">
                  <button
                    type="button"
                    onClick={() => setRenderLimit((n) => (n === Number.MAX_SAFE_INTEGER ? n : n + 200))}
                    className="inline-flex min-h-9 items-center rounded-lg bg-muted/70 border border-border px-4 text-[11px] text-muted-foreground font-medium hover:bg-accent transition-colors"
                  >
                    Показать ещё · ранние {visible.length - rendered.length}
                  </button>
                </div>
              )}
              {rendered.map((m, i) => {
                const prev = i > 0 ? rendered[i - 1] : null;
                const dayChanged = !prev || !sameDay(prev.createdAt, m.createdAt);
                const newGroup =
                  !prev ||
                  dayChanged ||
                  prev.userId !== m.userId ||
                  new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > GROUP_GAP_MS ||
                  !!prev.pending;
                return (
                  <div key={m.id}>
                    {dayChanged && <DayTicket label={dayLabel(m.createdAt)} />}
                    <MessageRow
                      message={m}
                      newGroup={newGroup}
                      isOwn={m.userId === currentUserId}
                      currentUserId={currentUserId}
                      highlight={highlightId === m.id}
                      onTapBubble={openMenu}
                      onJumpTo={jumpTo}
                      onToggleReaction={handleToggleReaction}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Новые сообщения, пока прокрутили вверх */}
        <AnimatePresence>
          {newCount > 0 && !searching && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => {
                setNewCount(0);
                atBottomRef.current = true;
                scrollToBottom(reduceMotion ? "auto" : "smooth");
              }}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-lg px-3.5 h-9 flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <ChevronDown className="size-4" />
              {newCount} {plural(newCount, "новое сообщение", "новых сообщения", "новых сообщений")}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Печатает… */}
      <AnimatePresence>
        {typingNames.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="px-4 pb-1 text-[11px] text-muted-foreground flex items-center gap-1.5 shrink-0"
            aria-live="polite"
          >
            <TypingDots />
            {typingNames.slice(0, 2).join(" и ")}
            {typingNames.length > 1 ? " печатают…" : " печатает…"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Композер */}
      <div className="shrink-0 pb-safe">
        {currentUserId ? (
          <div className="px-1.5 sm:px-4 pb-1.5">
            <div className="mx-auto max-w-3xl rounded-3xl border border-border glass-strong shadow-lg p-2 space-y-1.5">
              {/* Режим: ответ / правка */}
              <AnimatePresence initial={false}>
                {(replyTo || editing) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2 rounded-2xl bg-accent px-3 py-2">
                      {editing ? (
                        <Pencil className="size-3.5 text-primary shrink-0" />
                      ) : (
                        <CornerUpLeft className="size-3.5 text-primary shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold text-primary leading-tight">
                          {editing ? "Редактирование" : `Ответ ${replyTo?.user?.name ?? ""}`}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate leading-tight">
                          {(editing ?? replyTo)?.content}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(null);
                          setEditing(null);
                          setContent("");
                        }}
                        aria-label="Отменить"
                        className="btn-icon-touch size-7 text-muted-foreground hover:bg-accent-foreground/10 shrink-0"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Штампы — пока поле пустое */}
              {!content && !editing && (
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-0.5 pt-0.5">
                  {STAMPS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      disabled={add.isPending}
                      aria-label={`Отправить ${s}`}
                      className="h-9 min-w-11 px-2.5 rounded-full bg-muted/70 hover:bg-accent text-lg leading-none grid place-items-center active:scale-90 transition-transform disabled:opacity-50 shrink-0"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                <textarea
                  ref={taRef}
                  value={content}
                  onChange={(e) => handleType(e.target.value)}
                  onKeyDown={(e) => {
                    // На тач-устройствах Enter = перенос строки, отправка — кнопкой
                    if (e.key === "Enter" && !e.shiftKey && !isCoarse.current) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={editing ? "Изменить сообщение…" : replyTo ? "Ответить…" : "Сообщение…"}
                  rows={1}
                  maxLength={MAX_LEN}
                  className="flex-1 resize-none rounded-2xl border border-input bg-background px-3.5 py-2.5 text-[15px] input-mobile chat-input outline-none focus:ring-2 ring-primary/30 max-h-32 min-h-11"
                />
                <button
                  type="button"
                  onClick={() => send()}
                  disabled={(!content.trim() && !editing) || add.isPending || editMsg.isPending}
                  aria-label={editing ? "Сохранить" : "Отправить"}
                  className="size-11 rounded-full bg-gradient-to-br from-primary to-rose-500 text-primary-foreground grid place-items-center shadow-md shadow-primary/30 disabled:opacity-40 disabled:shadow-none active:scale-90 transition-transform shrink-0"
                >
                  {add.isPending || editMsg.isPending ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : editing ? (
                    <Pencil className="size-4.5" />
                  ) : (
                    <Send className="size-5 -translate-x-px translate-y-px" />
                  )}
                </button>
              </div>

              {/* Счётчик — только у длинных сообщений, подсказка — только десктоп */}
              {(content.length > MAX_LEN - 400 || !isCoarse.current) && (
                <div className="flex justify-between px-1.5 text-[10px] text-muted-foreground">
                  <span className={cn(isCoarse.current && "hidden sm:inline")}>
                    Enter — отправить · Shift+Enter — новая строка
                  </span>
                  {content.length > MAX_LEN - 400 && (
                    <span className={cn("tabular-nums", content.length > MAX_LEN - 100 && "text-amber-600")}>
                      {content.length}/{MAX_LEN}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="px-1.5 sm:px-4 pb-1.5">
            <div className="mx-auto max-w-3xl rounded-3xl border border-border glass-strong p-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Войдите, чтобы писать в чат</p>
              <a
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm px-4 min-h-11 rounded-xl bg-primary text-primary-foreground font-medium active:scale-95 transition-transform shrink-0"
              >
                <LogIn className="size-4" /> Войти
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Меню сообщения — всплывает над пузырём */}
      <MessageMenu
        msg={menuMsg}
        anchor={menu}
        canDelete={menuMsg ? canDelete(menuMsg) : false}
        onToggleReaction={(emoji) => {
          if (!menuMsg) return;
          vibrate(8);
          toggleReaction.mutate(
            { id: menuMsg.id, reaction: emoji },
            {
              onError: (err) =>
                toast.error("Не удалось поставить реакцию", {
                  description: err instanceof Error ? err.message : "Попробуйте ещё раз",
                }),
            }
          );
        }}
        onReply={() => {
          if (!menuMsg) return;
          setEditing(null);
          setReplyTo(menuMsg);
          closeMenu();
          taRef.current?.focus();
        }}
        onEdit={() => {
          if (!menuMsg) return;
          setReplyTo(null);
          setEditing(menuMsg);
          setContent(menuMsg.content);
          closeMenu();
          window.setTimeout(() => {
            taRef.current?.focus();
            if (taRef.current) fitTextarea(taRef.current);
          }, 50);
        }}
        onPin={() => {
          if (!menuMsg) return;
          togglePin.mutate(
            { id: menuMsg.id, pinned: !menuMsg.pinned },
            {
              onSuccess: () => toast.success(menuMsg.pinned ? "Откреплено" : "Закреплено 📌"),
              onError: (err) =>
                toast.error("Не удалось изменить закрепление", {
                  description: err instanceof Error ? err.message : "Попробуйте ещё раз",
                }),
            }
          );
          closeMenu();
        }}
        onCopy={() => {
          if (!menuMsg) return;
          navigator.clipboard
            ?.writeText(menuMsg.content)
            .then(() => toast.success("Скопировано"))
            .catch(() => toast.error("Не удалось скопировать"));
          closeMenu();
        }}
        onDelete={() => {
          if (!menuMsg) return;
          del.mutate(menuMsg.id, {
            onSuccess: () => {
              toast.success("Удалено");
              closeMenu();
            },
            onError: (err) =>
              toast.error("Не удалось удалить", {
                description: err instanceof Error ? err.message : "Попробуйте ещё раз",
              }),
          });
        }}
        deletePending={del.isPending}
        onClose={closeMenu}
      />
    </div>
  );
}

/* Автовысота textarea */
function fitTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
}

/* ==================================================================== */

// memo: при каждом WS-инвалиде перерисовываются только изменившиеся строки,
// а не вся история (аудит 2026-09-13)
const MessageRow = memo(function MessageRow({
  message: m,
  newGroup,
  isOwn,
  currentUserId,
  highlight,
  onTapBubble,
  onJumpTo,
  onToggleReaction,
}: {
  message: BoardMessage;
  newGroup: boolean;
  isOwn: boolean;
  /** id текущего юзера пропом: раньше каждая строка читала localStorage на рендере */
  currentUserId: string;
  highlight: boolean;
  onTapBubble: (m: BoardMessage, rect: DOMRect, own: boolean) => void;
  onJumpTo: (id: string) => void;
  onToggleReaction: (m: BoardMessage, emoji: string) => void;
}) {
  const emojiOnly = EMOJI_ONLY.test(m.content);

  /* Тап по пузырю открывает меню над сообщением.
     Если пользователь выделял текст — не считаем это тапом по сообщению. */
  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && sel.type === "Range" && !sel.isCollapsed) return;
    onTapBubble(m, e.currentTarget.getBoundingClientRect(), isOwn);
  };

  const reactionEntries = Object.entries(m.reactions).filter(([, ids]) => ids.length > 0);

  return (
    <div
      id={`msg-${m.id}`}
      className={cn("group/msg flex gap-2 px-1.5", isOwn && "flex-row-reverse", newGroup ? "mt-2.5" : "mt-0.5")}
    >
      {/* Аватар — только у чужих и только в начале группы */}
      {!isOwn &&
        (newGroup ? (
          <div
            className="size-7 rounded-full grid place-items-center text-sm shrink-0 mt-1 shadow-sm"
            style={{ background: m.user?.color || "#94a3b8" }}
            aria-hidden
          >
            {m.user?.emoji ?? "👤"}
          </div>
        ) : (
          <div className="size-7 shrink-0" aria-hidden />
        ))}

      <div className={cn("flex flex-col min-w-0", isOwn ? "items-end" : "items-start", "max-w-[85%] sm:max-w-[72%]")}>
        {/* Цитата */}
        {m.replyTo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation(); // тап по цитате ведёт к оригиналу, меню не открываем
              if (m.replyTo) onJumpTo(m.replyTo.id);
            }}
            className={cn(
              "mb-1 w-full max-w-full text-left rounded-lg px-2 py-1 border-l-2",
              isOwn ? "bg-primary-foreground/15" : "bg-muted/60"
            )}
            style={{ borderLeftColor: m.replyTo.user?.color || "var(--primary)" }}
          >
            <span
              className={cn("text-[11px] font-semibold block leading-tight", isOwn && "text-primary-foreground")}
              style={{ color: isOwn ? undefined : m.replyTo.user?.color || "var(--primary)" }}
            >
              {m.replyTo.user?.name ?? "Аноним"}
            </span>
            <span
              className={cn("text-[11px] block truncate leading-tight", isOwn ? "text-primary-foreground/75" : "text-muted-foreground")}
            >
              {m.replyTo.content}
            </span>
          </button>
        )}

        {/* Пузырь — тап открывает меню, правый клик тоже */}
        <div
          className={cn("relative", highlight && "chat-flash rounded-2xl")}
          onClick={handleTap}
          onContextMenu={(e) => {
            e.preventDefault();
            onTapBubble(m, e.currentTarget.getBoundingClientRect(), isOwn);
          }}
        >
          <div
            className={cn(
              "rounded-2xl px-3 py-2 shadow-sm cursor-pointer select-none",
              isOwn
                ? "bg-gradient-to-br from-primary to-rose-500 text-primary-foreground rounded-tr-md"
                : "bg-card border border-border rounded-tl-md",
              m.pinned && !isOwn && "border-amber-500/40",
              m.pending && "opacity-70"
            )}
          >
            {/* Шапка группы: имя */}
            {newGroup && !isOwn && (
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-semibold leading-tight" style={{ color: m.user?.color }}>
                  {m.user?.name ?? "Аноним"}
                </span>
                {m.pinned && <Pin className="size-3 text-amber-500 shrink-0" />}
              </div>
            )}
            <p
              className={cn(
                "whitespace-pre-wrap break-words leading-relaxed",
                emojiOnly ? "text-3xl leading-snug py-0.5" : "text-[15px]"
              )}
            >
              {renderContent(m.content, isOwn)}
            </p>
            {/* Метаданные внутри пузыря */}
            <div
              className={cn(
                "flex items-center gap-1.5 justify-end mt-0.5 text-[10px] tabular-nums",
                isOwn ? "text-primary-foreground/70" : "text-muted-foreground/70"
              )}
            >
              {m.pending && <Loader2 className="size-3 animate-spin" />}
              {isOwn && m.pinned && <Pin className="size-2.5" />}
              {m.editedAt && <span>изменено</span>}
              <span>{hhmm(m.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* Реакции */}
        {reactionEntries.length > 0 && (
          <div className={cn("flex flex-wrap gap-1 mt-1", isOwn && "justify-end")}>
            {reactionEntries.map(([emoji, ids]) => {
              const mine = !!currentUserId && ids.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onToggleReaction(m, emoji)}
                  aria-label={`Реакция ${emoji}, ${ids.length} — ${mine ? "убрать" : "поставить"}`}
                  aria-pressed={mine}
                  className={cn(
                    "inline-flex items-center gap-1 h-7 px-2 rounded-full text-xs border transition-transform active:scale-90",
                    mine
                      ? "border-primary/60 bg-primary/10"
                      : isOwn
                        ? "border-primary-foreground/25 bg-primary-foreground/10"
                        : "bg-muted/70 border-transparent"
                  )}
                >
                  <span className="leading-none">{emoji}</span>
                  <span className="tabular-nums leading-none">{ids.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

function renderContent(text: string, isOwn: boolean) {
  return text.split(URL_SPLIT).map((part, i) =>
    isUrl(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn("underline underline-offset-2", isOwn ? "text-primary-foreground" : "text-primary")}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/* ==================================================================== */

/* Меню сообщения: всплывает над пузырём (или под ним, если сверху тесно).
   Портал в body — внутри чата есть transformed-предок, fixed в нём ломается. */
function MessageMenu({
  msg,
  anchor,
  canDelete,
  onToggleReaction,
  onReply,
  onEdit,
  onPin,
  onCopy,
  onDelete,
  deletePending,
  onClose,
}: {
  msg: BoardMessage | null;
  anchor: { id: string; rect: DOMRect; own: boolean } | null;
  canDelete: boolean;
  onToggleReaction: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onPin: () => void;
  onCopy: () => void;
  onDelete: () => void;
  deletePending: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const myId =
    typeof window !== "undefined" ? localStorage.getItem("triptrek-current-user-id") : null;

  /* Сброс подтверждения удаления при смене сообщения — паттерн
     «корректировка state во время рендера», без эффекта */
  const [prevMenuId, setPrevMenuId] = useState<string | null>(null);
  if ((anchor?.id ?? null) !== prevMenuId) {
    setPrevMenuId(anchor?.id ?? null);
    setConfirmDel(false);
  }

  /* Escape закрывает меню */
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, onClose]);

  /* Позиция считается во время рендера, без измерений: меню прижимается
     низом к пузырю (grow-up), а если сверху тесно (< ~140px — шапка
     приложения) — верхом под пузырь. По горизонтали — к стороне автора
     и в пределах экрана. */
  if (!msg || !anchor) return null;
  const isOwn = anchor.own;
  const MENU_W = 224; // w-56
  const MENU_MAX_H = 330; // худший случай: реакции + 5 строк
  const x = Math.max(
    8,
    Math.min(anchor.own ? anchor.rect.right - MENU_W : anchor.rect.left, window.innerWidth - MENU_W - 8)
  );
  const below = anchor.rect.top - MENU_MAX_H - 6 < 140;
  const posStyle: React.CSSProperties = below
    ? { left: x, top: anchor.rect.bottom + 6 }
    : { left: x, bottom: window.innerHeight - anchor.rect.top + 6 };

  return createPortal(
    <>
      {/* Невидимая подложка: тап мимо меню закрывает его */}
      <div className="fixed inset-0 z-[95]" onClick={onClose} aria-hidden />
      <motion.div
        ref={ref}
        role="menu"
        aria-label="Действия с сообщением"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        style={posStyle}
        className={cn(
          "fixed z-[96] w-56 rounded-2xl border border-border glass-strong shadow-2xl overflow-hidden",
          below ? "origin-top" : "origin-bottom"
        )}
      >
        {/* Кто и когда */}
        <div className="px-3 pt-2 pb-1 text-[10px] text-muted-foreground flex items-center gap-1.5">
          <span className="font-semibold" style={{ color: msg.user?.color }}>
            {msg.user?.name ?? "Аноним"}
          </span>
          <span className="tabular-nums">{hhmm(msg.createdAt)}</span>
        </div>

        {/* Реакции — меню остаётся открытым, можно поставить несколько */}
        <div className="flex justify-between gap-0.5 px-2 py-1.5">
          {REACTIONS.map((emoji) => {
            const mine = !!myId && (msg.reactions[emoji] || []).includes(myId);
            return (
              <button
                key={emoji}
                type="button"
                role="menuitemcheckbox"
                aria-checked={mine}
                onClick={() => onToggleReaction(emoji)}
                aria-label={`Реакция ${emoji}`}
                className={cn(
                  "size-9 rounded-full text-xl grid place-items-center transition-transform active:scale-90",
                  mine ? "bg-primary/20 ring-1 ring-primary" : "bg-muted/70"
                )}
              >
                {emoji}
              </button>
            );
          })}
        </div>

        <div className="border-t border-border/70 p-1 space-y-0.5">
          <MenuRow icon={<CornerUpLeft className="size-4" />} label="Ответить" onClick={onReply} />
          <MenuRow icon={<Copy className="size-4" />} label="Копировать" onClick={onCopy} />
          <MenuRow
            icon={<Pin className={cn("size-4", msg.pinned && "text-amber-500")} />}
            label={msg.pinned ? "Открепить" : "Закрепить"}
            onClick={onPin}
          />
          {isOwn && <MenuRow icon={<Pencil className="size-4" />} label="Изменить" onClick={onEdit} />}
          {canDelete &&
            (confirmDel ? (
              <div className="flex items-center gap-1 p-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={onDelete}
                  disabled={deletePending}
                  className="flex-1 min-h-9 rounded-lg bg-destructive text-white text-xs font-medium active:scale-95 transition-transform disabled:opacity-50 inline-flex items-center justify-center gap-1"
                >
                  {deletePending && <Loader2 className="size-3.5 animate-spin" />} Точно удалить
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setConfirmDel(false)}
                  className="min-h-9 px-3 rounded-lg bg-secondary text-secondary-foreground text-xs active:scale-95 transition-transform"
                >
                  Отмена
                </button>
              </div>
            ) : (
              <MenuRow icon={<Trash2 className="size-4" />} label="Удалить" danger onClick={() => setConfirmDel(true)} />
            ))}
        </div>
      </motion.div>
    </>,
    document.body
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 min-h-9 px-2.5 rounded-lg text-[13px] font-medium transition-colors active:scale-[0.98]",
        danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/* ==================================================================== */

function DayTicket({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-2.5" aria-hidden>
      <div className="flex-1 border-t border-dashed border-border" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-background px-2.5 py-0.5 rounded-full border border-dashed border-border">
        {label}
      </span>
      <div className="flex-1 border-t border-dashed border-border" />
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      <span className="chat-dot" />
      <span className="chat-dot" />
      <span className="chat-dot" />
    </span>
  );
}

function EmptyChat({ canWrite, onStarter }: { canWrite: boolean; onStarter: (s: string) => void }) {
  return (
    <div className="h-full min-h-48 flex flex-col items-center justify-center text-center px-6 py-10">
      <div className="text-4xl mb-3">🏕️</div>
      <p className="text-sm font-medium">Здесь пока тихо</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-60">
        {canWrite ? "Начните разговор — это займёт секунду" : "Войдите, чтобы написать первое сообщение"}
      </p>
      {canWrite && (
        <div className="flex flex-wrap justify-center gap-1.5 mt-4">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStarter(s)}
              className="rounded-full border border-dashed border-border bg-card px-3 min-h-9 text-xs text-muted-foreground active:scale-95 transition-transform"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-3 py-2 px-1.5">
      {[64, 40, 76].map((w, i) => (
        <div key={i} className={cn("flex gap-2", i % 2 === 1 && "flex-row-reverse")}>
          <div className="size-7 rounded-full shimmer shrink-0" />
          <div className="shimmer rounded-2xl h-9" style={{ width: `${w * 1.4}px` }} />
        </div>
      ))}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-64 flex flex-col items-center justify-center gap-2 text-muted-foreground text-center animate-fade-up pb-16">
      {children}
    </div>
  );
}

function Retry({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 text-xs px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium min-h-11 active:scale-95 transition-transform"
    >
      Обновить
    </button>
  );
}
