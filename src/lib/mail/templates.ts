// Брендированные HTML-письма TripTrek. Табличная вёрстка + инлайн-стили:
// почтовые клиенты (Gmail, Mail.ru) не читают <style>. Градиент шапки дублируем
// bgcolor-розовым — Outlook градиенты не умеет, но fall-back будет аккуратный.
//
// Новый тип письма = одна функция здесь + один вызов sendMail в месте события.

import { mailLink } from "./mailer";

export interface EmailContent {
  subject: string;
  html: string;
}

// Палитра приложения (globals.css / login): оранжевый → розовый → фиолетовый
const GRADIENT = "linear-gradient(135deg, #f97316 0%, #f43f5e 55%, #7c3aed 100%)";
const HEADER_FALLBACK = "#f43f5e";
const PAGE_BG = "#fafaf9";
const CARD_BG = "#ffffff";
const TEXT = "#334155";
const MUTED = "#94a3b8";
const BTN_BG = "#f97316";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

interface RenderOpts {
  title: string; // заголовок на градиентной шапке
  subtitle?: string; // строка под заголовком
  bodyHtml: string; // абзацы основного текста (<p> уже со стилями)
  cta?: { label: string; url: string }; // фирменная кнопка
  footer?: string; // пояснение мелким шрифтом под кнопкой
}

function renderEmail(o: RenderOpts): string {
  const cta = o.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 8px;">
         <tr>
           <td bgcolor="${BTN_BG}" style="border-radius:12px;">
             <a href="${o.cta.url}" target="_blank" rel="noreferrer"
                style="display:inline-block; padding:14px 32px; font-family:${FONT}; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:12px;">
               ${o.cta.label} &rarr;
             </a>
           </td>
         </tr>
       </table>`
    : "";
  const footer = o.footer
    ? `<p style="margin:18px 0 0; font-family:${FONT}; font-size:12px; line-height:1.6; color:${MUTED};">${o.footer}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background:${PAGE_BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAGE_BG}" style="padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <!-- Шапка: градиент + логотип -->
          <tr>
            <td bgcolor="${HEADER_FALLBACK}" background="${GRADIENT}" style="background:${GRADIENT}; border-radius:20px 20px 0 0; padding:36px 24px 30px; text-align:center;">
              <div style="width:56px; height:56px; margin:0 auto 12px; background:rgba(255,255,255,0.2); border-radius:14px; line-height:56px; font-size:28px;">&#9992;&#65039;</div>
              <div style="font-family:${FONT}; font-size:24px; font-weight:bold; color:#ffffff;">TripTrek</div>
              <div style="font-family:${FONT}; font-size:14px; color:rgba(255,255,255,0.8); margin-top:6px;">${o.title}</div>
              ${o.subtitle ? `<div style="font-family:${FONT}; font-size:12px; color:rgba(255,255,255,0.65); margin-top:2px;">${o.subtitle}</div>` : ""}
            </td>
          </tr>
          <!-- Тело -->
          <tr>
            <td bgcolor="${CARD_BG}" style="border-radius:0 0 20px 20px; padding:28px 28px 24px;">
              ${o.bodyHtml}
              ${cta}
              ${footer}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0; font-family:${FONT}; font-size:11px; color:${MUTED};">
          Письмо отправлено автоматически — отвечать на него не нужно.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 14px; font-family:${FONT}; font-size:15px; line-height:1.6; color:${TEXT};">${text}</p>`;
}

/** Приветствие после регистрации. */
export function welcomeEmail(name: string): EmailContent {
  return {
    subject: "Добро пожаловать в TripTrek! 🎉",
    html: renderEmail({
      title: "Добро пожаловать!",
      subtitle: "Планирование поездок вместе с друзьями",
      bodyHtml:
        p(`${escapeHtml(name)}, привет! Ваш аккаунт готов — теперь всё о поездке в одном месте: маршрут, бюджет, разговорник, фото и дневник.`) +
        p("Создайте первую поездку или присоединитесь к поездке друга по коду приглашения.") +
        p("Хорошего пути! 🧳"),
      cta: { label: "Открыть TripTrek", url: mailLink("/") },
    }),
  };
}

/** Ссылка для сброса пароля (одноразовая, живёт ttlMinutes). */
export function resetPasswordEmail(name: string, resetUrl: string, ttlMinutes: number): EmailContent {
  return {
    subject: "Сброс пароля TripTrek",
    html: renderEmail({
      title: "Сброс пароля",
      subtitle: "Запрос на восстановление доступа",
      bodyHtml:
        p(`${escapeHtml(name)}, мы получили запрос на сброс пароля вашего аккаунта TripTrek.`) +
        p(`Нажмите кнопку ниже и задайте новый пароль. Ссылка действует <b>${ttlMinutes} минут</b> и срабатывает один раз.`),
      cta: { label: "Задать новый пароль", url: resetUrl },
      footer: "Если вы не запрашивали сброс — просто проигнорируйте это письмо: пароль останется прежним.",
    }),
  };
}

/** Уведомление: пароль изменён (сброс по ссылке или через админа). */
export function passwordChangedEmail(name: string): EmailContent {
  return {
    subject: "Пароль TripTrek изменён",
    html: renderEmail({
      title: "Пароль изменён",
      subtitle: "Безопасность аккаунта",
      bodyHtml:
        p(`${escapeHtml(name)}, пароль вашего аккаунта TripTrek только что был изменён. Все другие устройства автоматически вышли из аккаунта.`) +
        p("Если это были вы — всё в порядке, войдите с новым паролем."),
      cta: { label: "Войти в TripTrek", url: mailLink("/login") },
      footer: "Если вы не меняли пароль — аккаунт могли взломать: срочно сообщите админу через «Сообщить о проблеме» на странице входа.",
    }),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
