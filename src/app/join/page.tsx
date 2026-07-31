"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Plane, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { setTripId } from "@/hooks/use-trip";
import { useQueryClient } from "@tanstack/react-query";

export default function JoinPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: session } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ title: string; coverEmoji: string; coverColor: string; members: { displayName: string; emoji: string; color: string }[] } | null>(null);

  const userId = (session?.user as { id?: string } | undefined)?.id || "";

  const lookupTrip = async () => {
    if (code.trim().length < 3) {
      toast.error("Введите код поездки");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`/api/trips/join?code=${code.trim().toUpperCase()}`);
      const data = await r.json();
      if (data.error) {
        toast.error(data.error);
        setPreview(null);
      } else {
        setPreview(data);
      }
    } catch {
      toast.error("Не удалось найти поездку");
    } finally {
      setLoading(false);
    }
  };

  const joinTrip = async () => {
    if (!userId) {
      toast.error("Войдите чтобы присоединиться");
      router.push("/login");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/trips/join?code=${code.trim().toUpperCase()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          displayName: (session?.user as { name?: string })?.name || "Я",
          emoji: "👤",
          color: "#94a3b8",
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setTripId(data.tripId);
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
      toast.success("Вы присоединились к поездке! 🎉");
      router.push("/");
    } catch (e) {
      toast.error((e as Error).message || "Не удалось присоединиться");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600 relative overflow-hidden">
      <div className="absolute top-10 left-10 size-32 rounded-full bg-white/5 blur-2xl" />
      <div className="absolute bottom-20 right-10 size-40 rounded-full bg-white/5 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="size-16 rounded-2xl bg-white/20 backdrop-blur grid place-items-center text-white mx-auto mb-3 shadow-lg"
          >
            <Plane className="size-8" />
          </motion.div>
          <h1 className="text-2xl font-bold text-white">Присоединиться</h1>
          <p className="text-white/70 text-sm mt-1">Введите код поездки от друга</p>
        </div>

        <div className="bg-card rounded-3xl p-6 shadow-2xl border border-border">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Код поездки</label>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setPreview(null); }}
                onKeyDown={(e) => e.key === "Enter" && lookupTrip()}
                placeholder="Например, CHINA2024"
                autoFocus
                className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm uppercase tracking-wider font-mono"
              />
            </div>

            <button
              onClick={lookupTrip}
              disabled={loading || code.trim().length < 3}
              className="w-full rounded-xl bg-secondary border border-border py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
              Найти поездку
            </button>

            {preview && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="overflow-hidden"
              >
                <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="size-12 rounded-xl grid place-items-center text-2xl shadow-lg"
                      style={{ background: preview.coverColor }}
                    >
                      {preview.coverEmoji}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{preview.title}</div>
                      <div className="text-[11px] text-muted-foreground">{preview.members.length} участника</div>
                    </div>
                  </div>
                  <div className="flex -space-x-2">
                    {preview.members.slice(0, 5).map((m, i) => (
                      <div
                        key={i}
                        className="size-7 rounded-full grid place-items-center text-xs border-2 border-background"
                        style={{ background: m.color }}
                        title={m.displayName}
                      >
                        {m.emoji}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={joinTrip}
                    disabled={loading}
                    className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                    Присоединиться
                  </button>
                </div>
              </motion.div>
            )}

            <button
              onClick={() => router.push("/")}
              className="w-full text-xs text-muted-foreground hover:text-foreground py-2"
            >
              ← Назад
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
