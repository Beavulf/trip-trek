// Донаты из DonationAlerts (ADR-0011): чистая логика приёма — защитный разбор payload
// сокета и сшивка «донат → юзер TripTrek». Без БД и next/* — тесты рядом (donations.test.ts).
// Серверная половина (WS-клиент Centrifugo, ingest, уведомления админам) — donations-server.ts.
// Личности юзера DA не передаёт, поэтому сшивка — по email: адрес из сообщения доната
// (человек написал сам — сильный сигнал) или имя донатера, если оно само email.
// По User.name не матчим — имя неуникально, неверная автопривязка хуже отсутствия.

import { MAX_AMOUNT_CENTS, formatCents, toCents } from "./split/money";

export const DONATION_MESSAGE_MAX = 500;

export interface ParsedDonation {
  externalId: string;
  donaterName: string | null;
  daUsername: string | null;
  message: string | null;
  amountCents: number;
  currency: string;
  donatedAt: Date;
}

function asString(v: unknown, cap: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s ? s.slice(0, cap) : null;
}

/**
 * Защитный разбор доната из сокета Centrifugo: мусор/чужой формат → null (вызов логирует).
 * Поля DA: id, name, username, message, amount, currency, created_at — все опциональны
 * кроме id и amount. Валюта у DA всегда есть, но фолбэк RUB — основная валюта платформы.
 */
export function parseDonationEvent(raw: unknown): ParsedDonation | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const externalId = asString(r.id, 100);
  if (!externalId) return null;

  // amount приходит числом или строкой («150», «150.50»); ноль/отрицательные не донат
  const amount =
    typeof r.amount === "number"
      ? r.amount
      : typeof r.amount === "string"
        ? Number.parseFloat(r.amount.replace(",", "."))
        : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const amountCents = toCents(amount);
  if (amountCents > MAX_AMOUNT_CENTS) return null; // INT4 и здравый смысл

  let donatedAt = new Date();
  const createdAt = asString(r.created_at, 40);
  if (createdAt) {
    // DA шлёт время как «2025-04-12 07:15:49» (без T/Z): JS разобрал бы его как локальное
    // время сервера, а это UTC — нормализуем к ISO, иначе дата доната уплывает на часовой пояс VPS
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(createdAt)
      ? `${createdAt.replace(" ", "T")}Z`
      : createdAt;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) donatedAt = parsed;
  }

  return {
    externalId,
    donaterName: asString(r.name, 100),
    daUsername: asString(r.username, 100),
    message: asString(r.message, DONATION_MESSAGE_MAX),
    amountCents,
    currency: (asString(r.currency, 8) ?? "RUB").toUpperCase(),
    donatedAt,
  };
}

/** Email к сравнению: нижний регистр, края обрезаны. */
export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

/** Email-адреса из текста доната (человек пишет «для you@triptrek.com»), без дублей, в нижнем регистре. */
export function extractEmails(text: string): string[] {
  const out: string[] = [];
  const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  for (const m of text.matchAll(re)) {
    const email = normalizeEmail(m[0]);
    if (email && !out.includes(email)) out.push(email);
  }
  return out;
}

/**
 * Сшивка доната с юзером — ТОЛЬКО по email (User.name неуникально: два «Лёхи»
 * связались бы с одним донатом, а неверная автопривязка хуже отсутствия):
 * 1) email из сообщения доната (человек написал сам — сильный сигнал);
 * 2) имя донатера, если оно само является email. Не совпало — null: админ привяжет вручную.
 */
export function matchDonationToUser(
  d: { donaterName: string | null; message: string | null },
  users: { id: string; email: string }[],
): string | null {
  if (users.length === 0) return null;

  const candidates = [
    ...(d.message ? extractEmails(d.message) : []),
    ...(d.donaterName ? [normalizeEmail(d.donaterName)] : []),
  ];
  for (const candidate of candidates) {
    const hit = users.find((u) => normalizeEmail(u.email) === candidate);
    if (hit) return hit.id;
  }
  return null;
}

/** Одна строка «имя — 300 ₽: сообщение» для колокольчика; суммы — общий formatCents из split/money. */
export function formatDonationLine(d: {
  donaterName: string | null;
  amountCents: number;
  currency: string;
  message: string | null;
}): string {
  const name = d.donaterName || "Аноним";
  const sum = formatCents(d.amountCents, d.currency);
  return d.message ? `${name} — ${sum}: ${d.message}` : `${name} — ${sum}`;
}
