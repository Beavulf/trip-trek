"use client";

// Общие помощники страницы «Фразы»: TTS, поиск без диакритики, вибрация, размер шрифта.

import { detectLanguage } from "@/lib/language-detect";
import { toast } from "sonner";

/** Короткая вибрация (Android; iOS игнорирует — не страшно) */
export function buzz(ms: number | number[] = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* нет поддержки — ок */
  }
}

/** «nǐ hǎo» → «ni hao» — чтобы поиск работал без тоновых диакритик */
export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Размер фразы под длину: иероглифы крупно, предложения — влезающие */
export function phraseFontSize(text: string): string {
  const len = text.length;
  if (len <= 4) return "clamp(3.5rem, 20vw, 6.5rem)";
  if (len <= 10) return "clamp(2.5rem, 13vw, 4rem)";
  return "clamp(1.75rem, 9vw, 2.75rem)";
}

type SpeakOpts = { slow?: boolean; onStart?: () => void; onEnd?: () => void };

/**
 * Озвучка фразы голосом телефона. Язык определяется по письму (detectLanguage),
 * для латиницы без установленного голоса — читаем английским.
 */
export function speakPhrase(text: string, opts: SpeakOpts = {}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    toast.error("Озвучка не поддерживается в этом браузере", {
      description: "Попробуйте Chrome или Safari на телефоне",
    });
    return;
  }

  const synth = window.speechSynthesis;
  const finish = () => opts.onEnd?.();

  const run = (voices: SpeechSynthesisVoice[]) => {
    const lang = detectLanguage(text);
    const voice = voices.find((v) => v.lang.toLowerCase().startsWith(lang.langPrefix));

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = opts.slow ? 0.55 : 0.8;
    utter.pitch = 1;
    utter.onstart = opts.onStart ?? null;
    utter.onend = finish;
    utter.onerror = () => {
      finish();
      toast.error("Ошибка воспроизведения", { description: "Попробуйте Google Translate" });
    };

    if (voice) {
      utter.lang = lang.langCode;
      utter.voice = voice;
    } else if (lang.isLatin) {
      const en = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
      if (!en) {
        finish();
        toast.error(`Не установлен ${lang.langName} голос`, {
          description: "Установите голос в настройках TTS или откройте фразу в Google Translate",
          duration: 6000,
        });
        return;
      }
      utter.lang = "en-US";
      utter.voice = en;
      toast.info("Читаем английским голосом", { description: `${lang.langName} голос не установлен` });
    } else {
      finish();
      toast.error(`Не установлен ${lang.langName} голос`, {
        description: `Установите ${lang.langName} (${lang.langCode}) голос в настройках TTS, или используйте Google Translate`,
        duration: 6000,
      });
      return;
    }

    synth.cancel();
    synth.speak(utter);
  };

  const voices = synth.getVoices();
  if (voices.length > 0) {
    run(voices);
    return;
  }

  // Chrome отдаёт голоса асинхронно — ждём событие со страховочным таймером
  const onVoices = () => {
    synth.removeEventListener("voiceschanged", onVoices);
    run(synth.getVoices());
  };
  synth.addEventListener("voiceschanged", onVoices);
  setTimeout(() => {
    synth.removeEventListener("voiceschanged", onVoices);
    const v = synth.getVoices();
    if (v.length > 0 && !synth.speaking) run(v);
    else if (v.length === 0) finish();
  }, 800);
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ок */
  }
}
