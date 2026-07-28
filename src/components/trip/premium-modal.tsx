"use client";

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, X, Check, Sparkles, Users, Plane, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function PremiumModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!open || typeof document === "undefined") return null;

  const features = [
    { icon: Plane, label: "Безлимитные поездки", free: "1 поездка", premium: "Безлимит" },
    { icon: Users, label: "Участники", free: "5 человек", premium: "Безлимит" },
    { icon: Sparkles, label: "AI-фичи", free: "—", premium: "Доступны" },
    { icon: Zap, label: "Без рекламы", free: "—", premium: "Без рекламы" },
  ];

  const upgrade = (plan: "trip" | "yearly") => {
    // В реальном продакшене — Stripe/payment
    toast.success(plan === "trip" ? "Premium активирован на поездку! 🎉" : "Premium на год активирован! 🎉", {
      description: "Все лимиты сняты",
    });
    onOpenChange(false);
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      >
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-y-auto max-h-[95vh]"
        >
          {/* Handle */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-4 flex items-center justify-between text-white">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Crown className="size-5" /> Premium
            </h2>
            <button onClick={() => onOpenChange(false)} className="size-8 rounded-full bg-white/20 hover:bg-white/30 grid place-items-center">
              <X className="size-4" />
            </button>
          </div>

          <div className="p-5">
            {/* Заголовок */}
            <div className="text-center mb-5">
              <div className="text-4xl mb-2">👑</div>
              <h3 className="text-xl font-bold">Открой все возможности</h3>
              <p className="text-sm text-muted-foreground mt-1">Создавай безлимитные поездки и приглашай больше друзей</p>
            </div>

            {/* Сравнение */}
            <div className="space-y-2 mb-5">
              {features.map((f) => (
                <div key={f.label} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                  <f.icon className="size-5 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{f.label}</div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs">
                      <span className="text-muted-foreground">Free: {f.free}</span>
                      <span className="text-amber-600 font-medium flex items-center gap-1">
                        <Check className="size-3" /> {f.premium}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Тарифы */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Поездка */}
              <button
                onClick={() => upgrade("trip")}
                className="flex flex-col items-center gap-1 p-4 rounded-2xl border-2 border-border hover:border-amber-500 transition-colors"
              >
                <span className="text-xs text-muted-foreground">1 поездка</span>
                <span className="text-2xl font-bold">$5</span>
                <span className="text-[10px] text-muted-foreground">единоразово</span>
              </button>

              {/* Год */}
              <button
                onClick={() => upgrade("yearly")}
                className="flex flex-col items-center gap-1 p-4 rounded-2xl border-2 border-amber-500 bg-amber-500/10 transition-colors relative"
              >
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                  ВЫГОДНО
                </span>
                <span className="text-xs text-muted-foreground">1 год</span>
                <span className="text-2xl font-bold">$30</span>
                <span className="text-[10px] text-muted-foreground">$2.5/мес</span>
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              Демо-режим: кнопки работают без оплаты. В продакшене — Stripe.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
