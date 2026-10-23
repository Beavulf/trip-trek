"use client";

import { useState } from "react";
import { Crown, Loader2, LogOut, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/split/money";
import type { SplitMemberDTO } from "@/lib/split/types";
import { useAddMember, useRemoveMember, useUpdateMember } from "@/hooks/split/use-split";
import type { GroupModel } from "@/hooks/split/use-group-model";
import { MobileBottomSheet } from "@/components/trip/mobile-bottom-sheet";
import { StickySubmit } from "@/components/trip/quick-add/StickySubmit";
import { EmojiPicker, ColorPicker, MEMBER_EMOJIS, SWATCHES } from "./pickers";
import { MemberAvatar, SecondaryButton, inputClass } from "./ui";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  model: GroupModel;
  /** null — добавить нового участника без аккаунта */
  member: SplitMemberDTO | null;
  /** Выйти из группы и уйти на хаб */
  onLeft: () => void;
}

export function MemberSheet({ open, onOpenChange, model, member, onLeft }: Props) {
  return (
    <MobileBottomSheet open={open} onOpenChange={onOpenChange} title={member ? member.name : "Участник без аккаунта"}>
      <MemberBody key={member?.id ?? "new"} model={model} member={member} onDone={() => onOpenChange(false)} onLeft={onLeft} />
    </MobileBottomSheet>
  );
}

function MemberBody({ model, member, onDone, onLeft }: { model: GroupModel; member: SplitMemberDTO | null; onDone: () => void; onLeft: () => void }) {
  const group = model.group!;
  const add = useAddMember(group.id);
  const update = useUpdateMember(group.id);
  const remove = useRemoveMember(group.id);
  const [name, setName] = useState(member?.name ?? "");
  const [emoji, setEmoji] = useState(member?.emoji ?? MEMBER_EMOJIS[Math.floor(Math.random() * MEMBER_EMOJIS.length)]);
  const [color, setColor] = useState(member?.color ?? SWATCHES[Math.floor(Math.random() * SWATCHES.length)]);
  const [confirm, setConfirm] = useState<null | "remove" | "leave">(null);

  const isSelf = member?.id === group.myMemberId;
  const iAmOwner = group.myRole === "owner";
  // Профиль: себя — всегда; безаккаунтного — любой; реального человека — владелец
  const canEditProfile = !member || isSelf || member.userId === null || iAmOwner;
  const balance = member ? (model.balances.get(member.id) ?? 0) : 0;
  const busy = add.isPending || update.isPending || remove.isPending;

  const save = async () => {
    if (!name.trim()) {
      toast.error("Напиши имя");
      return;
    }
    try {
      if (member) await update.mutateAsync({ id: member.id, displayName: name, emoji, color });
      else await add.mutateAsync({ displayName: name, emoji, color });
      toast.success(member ? "Сохранено" : `${name.trim()} добавлен(а) в группу`);
      onDone();
    } catch (e) {
      toast.error("Не удалось сохранить", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const makeOwner = async () => {
    if (!member) return;
    try {
      await update.mutateAsync({ id: member.id, role: "owner" });
      toast.success(`${member.name} теперь владелец группы`);
      onDone();
    } catch (e) {
      toast.error("Не удалось передать владение", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const doRemove = async () => {
    if (!member) return;
    try {
      await remove.mutateAsync(member.id);
      toast.success(isSelf ? "Ты вышел(а) из группы" : `${member.name} убран(а) из группы`);
      onDone();
      if (isSelf) onLeft();
    } catch (e) {
      toast.error("Не получилось", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const preview = { name: name || "Имя", emoji, color, avatarUrl: member?.avatarUrl ?? null };

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-center gap-3">
        <MemberAvatar member={preview} className="size-14" />
        <div className="min-w-0 flex-1">
          {canEditProfile ? (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" maxLength={50} autoFocus={!member} className={inputClass} aria-label="Имя" />
          ) : (
            <div className="font-semibold">{member?.name}</div>
          )}
        </div>
      </div>

      {!member && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Для друга, который ещё не в приложении: его траты и долги ведутся как у всех. Позже он зайдёт по приглашению и выберет себя в списке — вся история достанется ему.
        </p>
      )}

      {canEditProfile && (
        <>
          <EmojiPicker value={emoji} onChange={setEmoji} options={MEMBER_EMOJIS} label="Значок" />
          <ColorPicker value={color} onChange={setColor} />
        </>
      )}

      {member && (
        <div className="space-y-2 pt-1">
          <div className="text-xs text-muted-foreground">
            {member.userId === null ? "Без аккаунта" : member.role === "owner" ? "Владелец группы" : "Участник"}
            {balance !== 0 && ` · баланс ${formatCents(balance, group.currency, { sign: true })}`}
          </div>

          {iAmOwner && !isSelf && member.userId !== null && member.status === "active" && (
            <SecondaryButton className="w-full" onClick={makeOwner} disabled={busy}>
              <Crown className="size-4" /> Сделать владельцем
            </SecondaryButton>
          )}

          {(isSelf ? !iAmOwner : iAmOwner || member.userId === null) && member.status === "active" && (
            confirm ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm">
                  {isSelf ? "Выйти из группы?" : `Убрать ${member.name} из группы?`}
                  {balance !== 0 && (
                    <span className="block text-xs text-muted-foreground mt-1">
                      {isSelf ? "У тебя" : "У него(неё)"} остался баланс {formatCents(balance, group.currency, { sign: true })}: он сохранится в расчётах, а историю трат видно как прежде.
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={doRemove} disabled={busy} className="flex-1 min-h-11 rounded-xl bg-destructive text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform">
                    {remove.isPending && <Loader2 className="size-4 animate-spin" />} {isSelf ? "Выйти" : "Убрать"}
                  </button>
                  <SecondaryButton className="flex-1" onClick={() => setConfirm(null)}>
                    Отмена
                  </SecondaryButton>
                </div>
              </div>
            ) : (
              <SecondaryButton className="w-full text-destructive" onClick={() => setConfirm(isSelf ? "leave" : "remove")}>
                {isSelf ? <LogOut className="size-4" /> : <UserMinus className="size-4" />}
                {isSelf ? "Выйти из группы" : "Убрать из группы"}
              </SecondaryButton>
            )
          )}
          {isSelf && iAmOwner && <p className="text-[11px] text-muted-foreground">Владелец не может выйти: сначала передай владение другому участнику.</p>}
        </div>
      )}

      {canEditProfile && (
        <StickySubmit>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className={cn("w-full rounded-xl py-3.5 min-h-[48px] text-base font-semibold flex items-center justify-center gap-2 bg-primary text-primary-foreground active:scale-[0.98] transition-transform", busy && "opacity-60")}
          >
            {(add.isPending || update.isPending) && <Loader2 className="size-4 animate-spin" />}
            {member ? "Сохранить" : "Добавить"}
          </button>
        </StickySubmit>
      )}
    </div>
  );
}
