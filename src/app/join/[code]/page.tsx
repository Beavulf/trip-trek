"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Plane, Users, Calendar, Check, X } from "lucide-react";
import { toast } from "sonner";
import { setTripId } from "@/hooks/use-trip";
import { useSession } from "next-auth/react";

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [code, setCode] = useState("");
  const [trip, setTrip] = useState<JoinTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    params.then((p) => setCode(p.code));
  }, [params]);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/trips/join?code=${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setLoading(false);
          return;
        }
        setTrip(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [code]);

  const join = async () => {
    if (!session?.user?.id) {
      toast.error("Войдите чтобы присоединиться");
      router.push("/login");
      return;
    }

    setJoining(true);
    try {
      const res = await fetch(`/api/trips/join?code=${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: (session.user as { id: string }).id,
          displayName: session.user.name || "Я",
          emoji: "👤",
          color: "#94a3b8",
        }),
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      setTripId(data.tripId);
      toast.success("Вы присоединились к поездке! 🎉");
      router.push("/");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600">
        <Loader2 className="size-8 animate-spin text-white" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-3xl p-8 shadow-2xl max-w-sm w-full text-center"
        >
          <X className="size-12 mx-auto text-red-500 mb-3" />
          <h1 className="text-xl font-bold mb-2">Неверный код</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Код приглашения недействителен или поездка удалена
          </p>
          <button
            onClick={() => router.push("/")}
            className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 font-medium"
          >
            На главную
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-3xl p-6 shadow-2xl max-w-sm w-full"
      >
        {/* Cover */}
        <div
          className="size-16 rounded-2xl grid place-items-center text-4xl mx-auto mb-3 shadow-lg"
          style={{ background: trip.coverColor }}
        >
          {trip.coverEmoji}
        </div>

        <h1 className="text-xl font-bold text-center">{trip.title}</h1>
        <p className="text-sm text-muted-foreground text-center mt-1">
          {trip.destination}
        </p>

        {/* Info */}
        <div className="space-y-2 mt-4">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="size-4 text-muted-foreground" />
            <span>{new Date(trip.startDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span>
            <span className="text-muted-foreground">· {trip.totalDays} дней</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-muted-foreground" />
            <span>{trip.members.length} участников:</span>
            <div className="flex -space-x-1.5">
              {trip.members.slice(0, 5).map((m, i) => (
                <div
                  key={i}
                  className="size-6 rounded-full grid place-items-center text-[10px] border-2 border-card"
                  style={{ background: m.color }}
                >
                  {m.emoji}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Join button */}
        {status === "loading" ? (
          <div className="flex items-center justify-center py-3 mt-4">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <button
            onClick={join}
            disabled={joining}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
          >
            {joining ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Check className="size-4" />
                Присоединиться
              </>
            )}
          </button>
        )}

        <p className="text-[11px] text-muted-foreground text-center mt-3">
          {session?.user ? `Вы: ${session.user.name}` : "Войдите чтобы присоединиться"}
        </p>
      </motion.div>
    </div>
  );
}

interface JoinTrip {
  id: string;
  title: string;
  destination: string;
  coverColor: string;
  coverEmoji: string;
  startDate: string;
  totalDays: number;
  members: Array<{ displayName: string; emoji: string; color: string }>;
}
