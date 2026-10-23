"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Copy, Check, Lock, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { SplitGroupDTO } from "@/lib/split/types";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { PrimaryButton, SecondaryButton } from "./ui";

// qrcode.react нужен только в этом шите — не тащим его в бандл экрана группы
const QRCodeSVG = dynamic(() => import("qrcode.react").then((m) => m.QRCodeSVG), {
  ssr: false,
  loading: () => <div className="size-40 rounded-xl bg-muted animate-pulse" />,
});

export function InviteSheet({ open, onOpenChange, group }: { open: boolean; onOpenChange: (v: boolean) => void; group: SplitGroupDTO }) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const code = group.inviteCode;
  const url = typeof window !== "undefined" && code ? `${window.location.origin}/split/join?code=${encodeURIComponent(code)}` : "";

  const copy = async (text: string, what: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
      toast.success(what === "link" ? "Ссылка скопирована" : "Код скопирован");
    } catch {
      toast.error("Не удалось скопировать", { description: "Скопируй вручную" });
    }
  };

  const share = async () => {
    if (!code) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Сочтёмся · ${group.name}`, text: `Давай делить траты в «${group.name}» — код ${code}`, url });
      } catch {
        // пользователь закрыл меню «Поделиться»
      }
    } else {
      await copy(url, "link");
    }
  };

  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Пригласить в группу" maxWidthClass="sm:max-w-sm">
      {!code ? (
        <div className="py-8 text-center space-y-2 text-muted-foreground">
          <Lock className="size-5 mx-auto" />
          <p className="text-sm font-medium text-foreground">Приглашения ограничены</p>
          <p className="text-xs">Звать новых участников может только владелец группы.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-3xl" aria-hidden>
              {group.emoji}
            </div>
            <p className="font-semibold mt-1">{group.name}</p>
          </div>

          <div className="flex justify-center">
            <div className="p-3 rounded-2xl bg-white">
              <QRCodeSVG value={url} size={152} />
            </div>
          </div>

          <button
            type="button"
            onClick={() => copy(code, "code")}
            className="w-full rounded-2xl bg-muted/60 py-3 text-center active:scale-[0.99] transition-transform"
            aria-label="Скопировать код"
          >
            <span className="block text-[11px] text-muted-foreground">Код приглашения</span>
            <span className="block text-2xl font-bold tracking-[0.25em] tabular-nums pl-[0.25em]">{code}</span>
          </button>

          <div className="flex gap-2">
            <PrimaryButton className="flex-1" onClick={share}>
              <Share2 className="size-4" /> Поделиться
            </PrimaryButton>
            <SecondaryButton className="flex-1" onClick={() => copy(url, "link")}>
              {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />} Ссылка
            </SecondaryButton>
          </div>
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            Друг откроет ссылку, войдёт или зарегистрируется — и сразу окажется в группе. Если вы уже записали его траты как «участника без аккаунта», он выберет себя в списке.
          </p>
        </div>
      )}
    </MobileBottomSheet>
  );
}
