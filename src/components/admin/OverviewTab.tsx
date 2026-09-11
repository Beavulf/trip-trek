"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bug,
  Image as ImageIcon,
  MapPin,
  MessagesSquare,
  NotebookPen,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { plural } from "@/lib/utils";
import { UserAvatar } from "@/components/trip/user-avatar";
import type { AdminStats } from "@/hooks/use-admin-stats";
import { FlipNumber, TripStatusStamp, fmtBytes, relTime } from "./shared";

// Обзор = табло диспетчерской. Фирменный элемент админки: hero-табло с точечной
// текстурой и «перещёлкивающимися» цифрами — как отправочное табло на вокзале.
// Всё остальное вокруг — тихие учётные карточки.

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
} as const;

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
}

function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)} дн ${h % 24} ч`;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

const AI_SOURCE_LABEL: Record<string, string> = {
  admin: "общий ключ админа",
  env: "переменная окружения",
  user: "—",
  none: "не настроен",
};

/** Клетка табло — mono-ярлык, большая цифра, приписка снизу.
 * Разделители задаём индексным классом (2×2 на мобиле → 4 в ряд на ПК). */
function BoardCell({
  label,
  value,
  sub,
  warn,
  divider,
}: {
  label: string;
  value: number | string;
  sub: string;
  warn?: boolean;
  divider: string;
}) {
  return (
    <div className={divider}>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">{label}</p>
      <div className="mt-1.5 flex items-end gap-1.5">
        <FlipNumber
          value={value}
          className={warn ? "text-4xl sm:text-5xl font-black leading-none text-amber-300" : "text-4xl sm:text-5xl font-black leading-none"}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-white/70 leading-tight">{sub}</p>
    </div>
  );
}

export function OverviewTab({ stats }: { stats: AdminStats }) {
  const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  // Что требует внимания админа прямо сейчас
  const attention: { icon: typeof Bug; text: string; href: string; tone: "amber" | "sky" }[] = [];
  if (stats.feedback.new > 0) {
    attention.push({
      icon: Bug,
      text: `${stats.feedback.new} ${plural(stats.feedback.new, "новый отзыв", "новых отзыва", "новых отзывов")} ждут разбора`,
      href: "/admin/feedback",
      tone: "amber",
    });
  }
  if (stats.health.ai.source === "none") {
    attention.push({
      icon: Sparkles,
      text: "Общий ИИ не настроен — функции ИИ недоступны без своего ключа",
      href: "/admin/settings",
      tone: "sky",
    });
  }

  const statCards = [
    { icon: MapPin, label: "Места", value: String(stats.places) },
    { icon: ReceiptText, label: "Траты", value: String(stats.expenses) },
    { icon: NotebookPen, label: "Дневники", value: String(stats.journals) },
    { icon: MessagesSquare, label: "Сообщения", value: String(stats.messages) },
    { icon: ShieldCheck, label: "Админы", value: String(stats.admins) },
    { icon: ImageIcon, label: "Диск", value: fmtBytes(stats.storage.total) },
    { icon: Users, label: "Premium", value: String(stats.premium) },
    { icon: ReceiptText, label: "БД", value: `${stats.health.dbLatencyMs} мс` },
  ];

  const maxReg = Math.max(1, ...stats.registrations14d.map((d) => d.count));

  const systemRows = [
    { label: "Версия", value: `v${stats.health.version}` },
    { label: "Режим", value: stats.health.nodeEnv },
    { label: "Node", value: stats.health.nodeVersion },
    { label: "Аптайм", value: fmtUptime(stats.health.uptimeSec) },
    { label: "База", value: `PostgreSQL · ${stats.health.dbLatencyMs} мс` },
    { label: "ИИ", value: AI_SOURCE_LABEL[stats.health.ai.source] || stats.health.ai.source },
    { label: "Push", value: stats.health.vapid ? "настроен" : "выключен" },
    { label: "Файлов", value: `${stats.storage.files} · ${fmtBytes(stats.storage.total)}` },
  ];

  return (
    <div className="space-y-4">
      {/* === ТАБЛО === */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl text-white bg-gradient-to-br from-primary via-primary to-[#1c1917]"
      >
        {/* точечная текстура табло */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.13) 1px, transparent 1.4px)",
            backgroundSize: "9px 9px",
          }}
        />
        <div className="relative">
          <div className="flex items-center justify-between px-4 sm:px-5 pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/70">
              TripTrek · табло · {today}
            </p>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300/90">
              <span className="size-1.5 rounded-full bg-emerald-300 animate-pulse" />
              система жива
            </span>
          </div>

          {/* разделители: 2×2 на мобиле, 4 в ряд на ПК */}
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4">
            <BoardCell divider="border-b border-r border-white/15 px-4 py-4 sm:border-b-0" label="Юзеры" value={stats.users} sub={`+${stats.usersNew7d} за неделю`} />
            <BoardCell divider="border-b border-white/15 px-4 py-4 sm:border-b-0 sm:border-r" label="Поездки" value={stats.trips} sub={`${stats.tripsActive} ${plural(stats.tripsActive, "в пути", "в пути", "в пути")}`} />
            <BoardCell divider="border-r border-white/15 px-4 py-4" label="Фото" value={stats.photos} sub={fmtBytes(stats.storage.total)} />
            <BoardCell divider="px-4 py-4" label="Отзывы" value={stats.feedback.new} sub={`${stats.feedback.inProgress} ${plural(stats.feedback.inProgress, "в работе", "в работе", "в работе")}`} warn={stats.feedback.new > 0} />
          </div>
        </div>
      </motion.section>

      {/* === Требует внимания === */}
      {attention.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden"
        >
          {attention.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.text}
                href={a.href}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
              >
                <span
                  className="size-9 rounded-xl grid place-items-center shrink-0"
                  style={{ background: a.tone === "amber" ? "#f59e0b1f" : "#0ea5e91f" }}
                >
                  <Icon className={`size-4 ${a.tone === "amber" ? "text-amber-500" : "text-sky-500"}`} />
                </span>
                <span className="text-sm font-medium flex-1">{a.text}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">открыть →</span>
              </Link>
            );
          })}
        </motion.section>
      )}

      {/* === Учётные карточки === */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
      >
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-2xl bg-card border border-border p-3.5">
              <Icon className="size-4 text-muted-foreground" />
              <div className="mt-2 text-2xl font-black tabular-nums leading-none">{c.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{c.label}</div>
            </div>
          );
        })}
      </motion.section>

      {/* === Графики === */}
      <div className="grid lg:grid-cols-2 gap-4">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-2xl bg-card border border-border p-4"
        >
          <h2 className="font-semibold text-sm">Активность · 14 дней</h2>
          <div className="h-44 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.activity14d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gPhotos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gJournals" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={dayLabel}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={18}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "var(--foreground)" }}
                  itemStyle={{ color: "var(--foreground)" }}
                  labelFormatter={(l: string) => dayLabel(l)}
                />
                <Area type="monotone" dataKey="photos" name="Фото" stackId="a" stroke="var(--chart-1)" fill="url(#gPhotos)" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" name="Траты" stackId="a" stroke="var(--chart-2)" fill="url(#gExpenses)" strokeWidth={2} />
                <Area type="monotone" dataKey="journals" name="Дневники" stackId="a" stroke="var(--chart-3)" fill="url(#gJournals)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-3 mt-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/80">
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: "var(--chart-1)" }} />фото</span>
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: "var(--chart-2)" }} />траты</span>
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: "var(--chart-3)" }} />дневники</span>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="rounded-2xl bg-card border border-border p-4"
        >
          <h2 className="font-semibold text-sm">Регистрации · 14 дней</h2>
          <div className="h-44 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.registrations14d} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={dayLabel}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={18}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, maxReg]}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip
                  formatter={(v: number) => [v, "Регистраций"]}
                  labelFormatter={(l: string) => dayLabel(l)}
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: "var(--foreground)" }}
                  itemStyle={{ color: "var(--foreground)" }}
                  cursor={{ fill: "var(--accent)" }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={28}>
                  {stats.registrations14d.map((entry, i) => (
                    <Cell key={i} fill={entry.count > 0 ? "var(--primary)" : "var(--muted)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-2">
            счёт по датам UTC
          </p>
        </motion.section>
      </div>

      {/* === Свежие === */}
      <div className="grid lg:grid-cols-2 gap-4">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-card border border-border overflow-hidden"
        >
          <h2 className="font-semibold text-sm px-4 pt-4 pb-2">Новые аккаунты</h2>
          <div className="divide-y divide-border">
            {stats.recent.users.map((u) => (
              <Link
                key={u.id}
                href={`/admin/users?q=${encodeURIComponent(u.email)}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors"
              >
                <UserAvatar name={u.name} emoji={u.emoji} color={u.color} avatarUrl={u.avatarUrl} className="size-9 text-base" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{u.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 shrink-0">
                  {relTime(u.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
          className="rounded-2xl bg-card border border-border overflow-hidden"
        >
          <h2 className="font-semibold text-sm px-4 pt-4 pb-2">Новые поездки</h2>
          <div className="divide-y divide-border">
            {stats.recent.trips.map((t) => (
              <Link
                key={t.id}
                href={`/admin/trips?q=${encodeURIComponent(t.title)}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors"
              >
                <span className="size-9 rounded-xl grid place-items-center text-lg shrink-0" style={{ background: `${t.coverColor}22` }}>
                  {t.coverEmoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    <span className="truncate">{t.title}</span>
                    <TripStatusStamp status={t.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t._count.members} {plural(t._count.members, "участник", "участника", "участников")}
                  </div>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 shrink-0">
                  {relTime(t.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        </motion.section>
      </div>

      {/* === Система === */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        className="rounded-2xl bg-card border border-border p-4"
      >
        <h2 className="font-semibold text-sm">Система</h2>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {systemRows.map((r) => (
            <div key={r.label} className="rounded-xl bg-secondary/50 px-3 py-2.5">
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">{r.label}</div>
              <div className="font-mono text-xs font-semibold mt-0.5 truncate" title={r.value}>
                {r.value}
              </div>
            </div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
