import type { Transporter } from "nodemailer";

// Email через nodemailer → локальный postfix-ретранслятор хоста (host.docker.internal:25).
// По образцу notify.ts: всё fire-and-forget, без SMTP_HOST — тихий no-op
// (как push без VAPID-ключей). Сбой доставки никогда не роняет основную операцию.

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

/** true, если почта включена (задан SMTP_HOST). */
export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

// Транспорт создаём один раз и переиспользуем (пул соединений с postfix)
let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 25);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 — SMTPS, всё остальное (в т.ч. наш postfix:25) — plain
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    // Postfix хоста анонсирует STARTTLS с самоподписанным сертификатом — это
    // локальный релей внутри одной машины, проверять подпись нечего и не нужно.
    // Без этого nodemailer рвёт рукопожатие с «self signed certificate».
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
  return transporter;
}

function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Адрес отправителя по умолчанию: MAIL_FROM, иначе выводим из домена приложения. */
function mailFrom(): string {
  return process.env.MAIL_FROM || `TripTrek <no-reply@${new URL(appBaseUrl()).hostname}>`;
}

/**
 * Отправить письмо. Никогда не бросает: сбой пишется в лог, операция вызывающего
 * кода не страдает. Не настроено — тихий no-op с предупреждением.
 */
export async function sendMail(msg: MailMessage): Promise<void> {
  if (!isMailConfigured()) {
    console.warn(`[mail] SMTP_HOST не задан — письмо «${msg.subject}» для ${msg.to} не отправлено`);
    return;
  }
  try {
    const t = await getTransporter();
    await t.sendMail({
      from: mailFrom(),
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      // Текстовая запаска для клиентов без HTML: грубо снимаем разметку
      text: msg.html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    });
  } catch (e) {
    console.error(`[mail] failed to send «${msg.subject}» to ${msg.to}:`, e);
  }
}

/** База для ссылок в письмах: NEXTAUTH_URL (в dev — localhost). */
export function mailLink(path: string): string {
  return `${appBaseUrl()}${path}`;
}
