"use client";

import { useEffect, useState } from "react";
import { reachGoal } from "@/lib/metrika";
import { isInAppBrowser } from "@/app/landing/showcase";

// Установка приложения (PWA): beforeinstallprompt прилетает до монтирования React
// (сразу после регистрации service worker), поэтому единственное событие ловим
// на уровне модуля и раздаём подписчикам хука.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Промпт Chrome одноразовый: после prompt() повторно его вызвать нельзя до перезагрузки страницы
let deferred: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();
let listening = false;

function listenOnce() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // своя строка в профиле вместо штатного мини-баннера Chrome
    deferred = e as BeforeInstallPromptEvent;
    subscribers.forEach((notify) => notify());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    subscribers.forEach((notify) => notify());
    reachGoal("app_installed");
  });
}

/** Страница открыта как установленное приложение (Android WebAPK, iOS «На экран Домой»). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari про display-mode не знает — только navigator.standalone
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Чем на этом устройстве можно поставить приложение — от этого зависят подпись строки и шит. */
export type InstallSurface =
  | "none" // показывать нечего: уже установлено или платформа без поддержки
  | "native" // есть родной диалог Chrome (Android, десктоп-Chrome)
  | "ios" // iOS: только инструкция «Поделиться → На экран «Домой»»
  | "manual-android" // промпт в этой сессии уже потрачен — установка через меню браузера
  | "in-app"; // встроенный браузер соцсети: сначала «открыть в Chrome/Safari»

export function installSurface(input: {
  standalone: boolean;
  hasPrompt: boolean;
  isIos: boolean;
  isAndroid: boolean;
  inApp: boolean;
}): InstallSurface {
  if (input.standalone) return "none";
  if (input.inApp) return "in-app";
  if (input.hasPrompt) return "native";
  if (input.isIos) return "ios";
  if (input.isAndroid) return "manual-android";
  return "none";
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export function useInstallApp() {
  // Всё, что читается из браузера, — только после монтирования: иначе не сходится
  // серверная разметка с клиентской (как «Тема» в ProfileSettings)
  const [mounted, setMounted] = useState(false);
  const [hasPrompt, setHasPrompt] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    listenOnce();
    const notify = () => {
      setHasPrompt(deferred !== null);
      setStandalone(isStandaloneDisplay());
    };
    notify();
    setMounted(true);
    subscribers.add(notify);
    // Установили из соседнего окна: display-mode меняется без beforeinstallprompt
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener?.("change", notify);
    return () => {
      subscribers.delete(notify);
      mq.removeEventListener?.("change", notify);
    };
  }, []);

  const ua = mounted ? window.navigator.userAgent : null;
  const surface = installSurface({
    standalone,
    hasPrompt,
    isIos:
      !!ua &&
      (/iPhone|iPad|iPod/i.test(ua) ||
        // iPadOS 13+ прикидывается Macintosh: отличаем по наличию тача
        (/Macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1)),
    isAndroid: !!ua && /Android/i.test(ua),
    inApp: isInAppBrowser(ua),
  });

  /** Родной диалог установки Chrome. "unavailable" — промпта нет (потрачен или не прилетел). */
  const promptInstall = async (): Promise<InstallOutcome> => {
    if (!deferred) return "unavailable";
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      reachGoal(outcome === "accepted" ? "app_install_accept" : "app_install_dismiss");
      return outcome;
    } catch {
      return "unavailable";
    } finally {
      deferred = null;
      setHasPrompt(false);
    }
  };

  return { mounted, surface, standalone, promptInstall };
}
