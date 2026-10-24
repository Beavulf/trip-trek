import { validatePasswordPolicy } from "@/lib/password-policy";

// Проверки формы входа/регистрации до отправки: те же правила, что на сервере, но с текстом,
// который ставится прямо под кнопкой. Чистые функции — форма (login-form.tsx) только вызывает.

export interface AuthFormInput {
  mode: "login" | "register";
  name: string;
  email: string;
  password: string;
  invite: string;
  /** Нужен ли инвайт-код; null — режим неизвестен (БД не ответила), код тогда не требуем на клиенте */
  inviteRequired: boolean | null;
}

// Не строгая проверка адреса, а защита от опечаток вроде «имя@» — окончательно решает сервер
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Первая ошибка формы или null, если можно отправлять. */
export function validateAuthForm(f: AuthFormInput): string | null {
  const email = f.email.trim();
  if (f.mode === "register" && !f.name.trim()) return "Введите имя";
  if (f.mode === "register" && f.inviteRequired === true && !f.invite.trim()) {
    return "Введите инвайт-код — он в описании видео или у того, кто вас пригласил";
  }
  if (!email) return "Введите email";
  if (!EMAIL_RE.test(email)) return "Проверьте email: похоже, в адресе опечатка";
  if (!f.password) return "Введите пароль";
  if (f.mode === "register") return validatePasswordPolicy(f.password);
  return null;
}

/** Ответ сервера → текст ошибки: тело не JSON (502 от прокси, обрыв) не должно ронять форму. */
export function serverErrorText(status: number, body: unknown): string {
  const msg = (body as { error?: unknown } | null)?.error;
  if (typeof msg === "string" && msg) return msg;
  if (status === 429) return "Слишком много попыток. Подождите немного и повторите.";
  if (status >= 500) return "Сервер временно недоступен. Повторите через минуту.";
  return `Не получилось (ошибка ${status}). Повторите попытку.`;
}

/** Сервер отказал из-за кода — значит, поле кода нужно показать, даже если режим не успел загрузиться. */
export function isInviteError(message: string): boolean {
  return /инвайт-код|код недействителен/i.test(message);
}
