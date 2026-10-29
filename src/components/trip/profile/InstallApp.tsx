"use client";

import { useState } from "react";
import { ArrowRight, Copy, Download, MoreVertical, Plus, Share, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { MobileBottomSheet } from "../mobile-bottom-sheet";
import { useInstallApp, type InstallSurface } from "@/hooks/use-install-app";
import { reachGoal } from "@/lib/metrika";

// Стили строки — как ROW в ProfileSettings; константу оттуда не импортируем, чтобы не плодить цикл
const ROW =
  "w-full flex items-center gap-3 p-3.5 text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary";

// Подпись зависит от того, чем на устройстве можно поставить приложение (хук считает surface)
const ROW_COPY: Record<Exclude<InstallSurface, "none">, string> = {
  native: "Во весь экран, с иконкой на рабочем столе",
  ios: "Как добавить на экран «Домой»",
  "manual-android": "Через меню браузера — покажем где",
  "in-app": "Сначала открой TripTrek в Chrome или Safari",
};

type SheetSurface = Exclude<InstallSurface, "none" | "native">;

/**
 * Строка «Установить приложение» в настройках профиля. Android/Chrome — родной диалог
 * установки (WebAPK: иконка в списке приложений, открытие во весь экран), iOS и остальные
 * случаи — шит с инструкцией. В установленном виде (standalone) строка сама исчезает,
 * поэтому установившим она в глаза не бросается.
 */
export function InstallAppRow() {
  const { mounted, surface, promptInstall } = useInstallApp();
  const [sheet, setSheet] = useState<SheetSurface | null>(null);

  // До монтирования браузер не читаем (hydration), а без способа установки строку не рисуем вовсе
  if (!mounted || surface === "none") return null;

  const onClick = () => {
    reachGoal("app_install_tap");
    if (surface === "native") {
      void promptInstall().then((outcome) => {
        // Промпта не оказалось (гонка с потреблением в другой вкладке) — отвечаем инструкцией
        if (outcome === "unavailable") setSheet("manual-android");
      });
    } else {
      setSheet(surface);
    }
  };

  return (
    <>
      <button type="button" onClick={onClick} className={ROW}>
        <div className="size-9 rounded-xl bg-secondary grid place-items-center shrink-0">
          <Smartphone className="size-4.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Установить приложение</div>
          <div className="text-xs text-muted-foreground">{ROW_COPY[surface]}</div>
        </div>
        <ArrowRight className="size-4 text-muted-foreground shrink-0" />
      </button>

      {/* Монтируем по клику: окно каждый раз открывается с чистого состояния (как FeedbackSheet) */}
      {sheet && <InstallSheet surface={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}

function InstallSheet({ surface, onClose }: { surface: SheetSurface; onClose: () => void }) {
  return (
    <MobileBottomSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title="Установить TripTrek"
      titleIcon={<Download className="size-4 text-primary" />}
    >
      <div className="space-y-4">
        {surface === "ios" && <IosSteps />}
        {surface === "manual-android" && <AndroidSteps />}
        {surface === "in-app" && <InAppSteps />}
        <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
          После установки TripTrek открывается во весь экран, без адресной строки — как приложение из стора,
          а push-уведомления приходят даже когда вкладка закрыта.
        </p>
      </div>
    </MobileBottomSheet>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 size-6 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-bold grid place-items-center">
        {n}
      </span>
      <span className="text-sm leading-snug text-pretty">{children}</span>
    </li>
  );
}

// Иконка-«кнопка» внутри текста шага: стилизованная под системные жесты iOS/Android
function InlineIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex size-5 -translate-y-0.5 items-center justify-center rounded-md border border-border bg-muted align-middle mx-0.5">
      {children}
    </span>
  );
}

function IosSteps() {
  return (
    <ol className="space-y-3">
      <Step n={1}>Открой TripTrek в Safari (если читаешь это в Chrome — шаги те же)</Step>
      <Step n={2}>
        Внизу нажми «Поделиться»
        <InlineIcon>
          <Share className="size-3.5" />
        </InlineIcon>
      </Step>
      <Step n={3}>
        Выбери «На экран “Домой”» и подтверди «Добавить»
        <InlineIcon>
          <Plus className="size-3.5" />
        </InlineIcon>
      </Step>
    </ol>
  );
}

function AndroidSteps() {
  return (
    <ol className="space-y-3">
      <Step n={1}>
        Открой меню браузера — три точки
        <InlineIcon>
          <MoreVertical className="size-3.5" />
        </InlineIcon>
        справа вверху
      </Step>
      <Step n={2}>Выбери «Установить приложение» (или «Добавить на главный экран»)</Step>
      <Step n={3}>Подтверди — иконка TripTrek появится среди приложений</Step>
    </ol>
  );
}

function InAppSteps() {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать — выдели адрес вручную");
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm leading-snug text-pretty">
        Это встроенный браузер соцсети — установку он не умеет. Скопируй ссылку и открой её в Chrome
        (Android) или Safari (iPhone), там шаги установки простые.
      </p>
      <button
        type="button"
        onClick={() => void copyLink()}
        className="min-h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <Copy className="size-4" />
        Скопировать ссылку на TripTrek
      </button>
    </div>
  );
}
