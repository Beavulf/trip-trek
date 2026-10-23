"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { normalizeInviteCode } from "@/lib/split/invite";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { StickySubmit } from "@/components/trip/quick-add/StickySubmit";
import { PrimaryButton, inputClass } from "./ui";

export function JoinByCodeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const go = () => {
    const c = normalizeInviteCode(code);
    if (c.length < 4) return;
    onOpenChange(false);
    router.push(`/split/join?code=${encodeURIComponent(c)}`);
  };
  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title="Вступить по коду" maxWidthClass="sm:max-w-sm">
      <div className="space-y-4 pt-1">
        <p className="text-sm text-muted-foreground">Попроси у друга код приглашения (8 символов) или открой его ссылку.</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="ABCD2345"
          maxLength={16}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Код приглашения"
          className={cn(inputClass, "text-center text-xl font-bold tracking-[0.2em] uppercase")}
        />
        <StickySubmit>
          <PrimaryButton className="w-full min-h-12" onClick={go} disabled={normalizeInviteCode(code).length < 4}>
            Найти группу
          </PrimaryButton>
        </StickySubmit>
      </div>
    </MobileBottomSheet>
  );
}
