"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin } from "lucide-react";

// Прямая ссылка /join/<КОД> — только редирект на единую страницу /join?code=…
// Превью, вход и присоединение живут в одном месте: у старой копии здесь
// неавторизованным показывалось «Неверный код» вместо поездки.
export default function JoinByCodePage({ params }: { params: Promise<{ code: string }> }) {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    params.then((p) => {
      if (alive) router.replace(`/join?code=${encodeURIComponent(p.code)}`);
    });
    return () => {
      alive = false;
    };
  }, [params, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600">
      <div className="size-14 rounded-2xl bg-white/20 backdrop-blur grid place-items-center text-white shadow-lg">
        <MapPin className="size-7" />
      </div>
      <Loader2 className="size-5 animate-spin text-white/80" />
    </div>
  );
}
