"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Coffee, Play, Pause, RotateCcw, Bell, BellOff, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DEFAULT_INTERVAL = 120; // 2 часа по умолчанию (рекомендация из плана)
const BREAK_DURATION = 15; // 15 минут отдых

export function RestTimer() {
  const [interval, setIntervalVal] = useState(DEFAULT_INTERVAL * 60);
  const [remaining, setRemaining] = useState(DEFAULT_INTERVAL * 60);
  const [running, setRunning] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [breakMode, setBreakMode] = useState(false);

  const requestNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Уведомления не поддерживаются в этом браузере");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setNotifications(true);
      toast.success("Уведомления включены! 🔔");
    } else {
      toast.error("Разрешение на уведомления не получено");
    }
  };

  const sendNotification = (title: string, body: string) => {
    if (notifications && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon-192.png" });
    }
  };

  // Таймер — интервал запускаем только когда running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Обработка достижения нуля — setState в effect, но это легитимно для таймера
  useEffect(() => {
    if (remaining !== 0 || !running) return;
    if (breakMode) {
      sendNotification("Отдых окончен! 🚶", "Пора продолжать исследовать!");
      setBreakMode(false); // eslint-disable-line react-hooks/set-state-in-effect
      setRunning(false);
      setRemaining(interval);
    } else {
      sendNotification("Время отдохнуть! ☕", `Сделайте перерыв ${BREAK_DURATION} минут. Вы заслужили!`);
      toast.success("Время отдохнуть! ☕", { description: `Перерыв ${BREAK_DURATION} мин` });
      setBreakMode(true);
      setRemaining(BREAK_DURATION * 60);
    }
  }, [remaining, running, breakMode, interval]);

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const reset = () => {
    setRunning(false);
    setBreakMode(false);
    setRemaining(interval);
  };

  const changeInterval = (mins: number) => {
    const newInterval = mins * 60;
    setIntervalVal(newInterval);
    if (!running) setRemaining(newInterval);
  };

  const pct = breakMode
    ? ((BREAK_DURATION * 60 - remaining) / (BREAK_DURATION * 60)) * 100
    : ((interval - remaining) / interval) * 100;

  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Coffee className="size-4" /> Таймер отдыха
        </h2>
        <button
          onClick={notifications ? () => setNotifications(false) : requestNotifications}
          className={cn(
            "size-8 rounded-lg grid place-items-center transition-colors",
            notifications ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:bg-accent"
          )}
          title={notifications ? "Уведомления включены" : "Включить уведомления"}
        >
          {notifications ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        </button>
      </div>

      {/* Круговой таймер */}
      <div className="relative w-48 h-48 mx-auto mb-4">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r={radius} fill="none" stroke="var(--muted)" strokeWidth="10" />
          <motion.circle
            cx="100" cy="100" r={radius}
            fill="none"
            stroke={breakMode ? "#10b981" : "var(--primary)"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.5 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={cn("text-3xl font-bold tabular-nums", breakMode ? "text-green-500" : "")}>
            {formatTime(remaining)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <Clock className="size-2.5" />
            {breakMode ? "Перерыв" : "До перерыва"}
          </div>
        </div>
      </div>

      {/* Кнопки управления */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <button
          onClick={() => setRunning((r) => !r)}
          className={cn(
            "size-12 rounded-full grid place-items-center text-white shadow-lg active:scale-90 transition-transform",
            running ? "bg-amber-500" : "bg-primary"
          )}
        >
          {running ? <Pause className="size-5" /> : <Play className="size-5 ml-0.5" />}
        </button>
        <button
          onClick={reset}
          className="size-10 rounded-full grid place-items-center bg-muted hover:bg-accent transition-colors"
          title="Сбросить"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>

      {/* Интервалы */}
      <div className="flex items-center gap-1.5 justify-center">
        <span className="text-[10px] text-muted-foreground mr-1">Каждые:</span>
        {[60, 90, 120, 180].map((mins) => (
          <button
            key={mins}
            onClick={() => changeInterval(mins)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
              interval === mins * 60 ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
            )}
          >
            {mins < 60 ? `${mins}м` : `${Math.floor(mins / 60)}ч${mins % 60 ? ` ${mins % 60}м` : ""}`}
          </button>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-3 leading-relaxed">
        💡 План рекомендует остановки каждые 2-3 часа в кафе. Отдых 15 мин поможет в жару.
      </p>
    </div>
  );
}
