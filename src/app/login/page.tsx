import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getPublicShowcase } from "@/lib/app-config";
import { LANDING_SEEN_COOKIE, landingRedirectTarget } from "@/app/landing/showcase";
import { LoginForm, type LoginFormProps } from "./login-form";

// Режим регистрации (закрыта ли, нужен ли инвайт-код) и контакт читаем на сервере и отдаём форме
// пропсами: раньше форма ходила за ними отдельным запросом, и при слабой связи поля кода не было вовсе.
// Сегмент динамический (см. layout.tsx), так что настройки из админки действуют без пересборки.
export const dynamic = "force-dynamic";

async function loadOptions(): Promise<LoginFormProps> {
  try {
    const s = await getPublicShowcase();
    return { registrationEnabled: s.registrationEnabled, inviteRequired: s.inviteRequired, contactTelegram: s.contactTelegram };
  } catch {
    // БД не ответила: форму всё равно показываем. Поле кода — как необязательное,
    // а если сервер на регистрации потребует код, форма покажет его сама
    return { registrationEnabled: true, inviteRequired: null, contactTelegram: null };
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Временный режим «первый визит → лендинг» (LANDING_REDIRECT в .env: 1 или ссылка /landing?code=…; убрали — форма входа как раньше).
  // redirect() кидает исключение, поэтому стоит вне try/catch, до любой работы с БД
  const [jar, params] = await Promise.all([cookies(), searchParams]);
  const target = landingRedirectTarget({
    setting: process.env.LANDING_REDIRECT,
    hasSession: jar.has("next-auth.session-token") || jar.has("__Secure-next-auth.session-token"),
    seen: jar.has(LANDING_SEEN_COOKIE),
    params,
  });
  if (target) redirect(target);

  const options = await loadOptions();
  return (
    // useSearchParams в форме требует Suspense
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-500 via-rose-500 to-violet-600">
          <Loader2 className="size-8 text-white animate-spin" />
        </div>
      }
    >
      <LoginForm {...options} />
    </Suspense>
  );
}
