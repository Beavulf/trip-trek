"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/split/money";
import type { SplitMemberDTO } from "@/lib/split/types";
import { UserAvatar } from "@/components/trip/user-avatar";

// Мелкие общие части экранов «Сочтёмся»: аватар участника, сумма со знаком, сегмент-переключатель, пустое состояние.

type MemberLike = Pick<SplitMemberDTO, "name" | "emoji" | "color"> & { avatarUrl?: string | null };

export function MemberAvatar({ member, className }: { member: MemberLike; className?: string }) {
  return (
    <UserAvatar
      name={member.name}
      emoji={member.emoji}
      color={member.color}
      avatarUrl={member.avatarUrl}
      className={cn("size-8", className)}
      textClassName="text-xs"
    />
  );
}

/** Наложенные друг на друга аватары группы + «+N». */
export function AvatarStack({ members, total, size = "size-7" }: { members: MemberLike[]; total: number; size?: string }) {
  const shown = members.slice(0, 4);
  const extra = total - shown.length;
  return (
    <div className="flex items-center -space-x-2" aria-label={`${total} участников`}>
      {shown.map((m, i) => (
        <MemberAvatar key={i} member={m} className={cn(size, "ring-2 ring-card")} />
      ))}
      {extra > 0 && (
        <span className={cn("rounded-full bg-muted text-[10px] font-semibold text-muted-foreground grid place-items-center ring-2 ring-card", size)}>
          +{extra}
        </span>
      )}
    </div>
  );
}

/** Цвета баланса: «мне должны» — зелёный, «я должен» — красный, ровно — приглушённый. */
export const balanceTone = (cents: number) =>
  cents > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : cents < 0
      ? "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";

export function Money({
  cents,
  currency,
  signed = false,
  tone = false,
  className,
}: {
  cents: number;
  currency: string;
  signed?: boolean;
  tone?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums whitespace-nowrap", tone && balanceTone(cents), className)}>
      {formatCents(cents, currency, { sign: signed })}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className={cn("flex gap-1 p-1 rounded-xl bg-muted", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-lg font-medium transition-colors active:scale-[0.97] whitespace-nowrap",
              size === "sm" ? "min-h-9 text-xs px-2" : "min-h-10 text-sm px-3",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  emoji,
  title,
  text,
  children,
}: {
  emoji: string;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="py-10 px-4 text-center space-y-2">
      <div className="text-4xl" aria-hidden>
        {emoji}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {text && <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">{text}</p>}
      {children && <div className="pt-2 flex justify-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

export function PrimaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold",
        "active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none",
        className
      )}
    />
  );
}

export function SecondaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-xl bg-secondary text-foreground border border-border text-sm font-medium",
        "hover:bg-accent active:scale-[0.98] transition-[transform,background-color] disabled:opacity-50 disabled:pointer-events-none",
        className
      )}
    />
  );
}

export const inputClass =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base input-mobile focus:outline-none focus:ring-2 focus:ring-ring/40";
