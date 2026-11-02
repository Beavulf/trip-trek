// Донаты из DonationAlerts (ADR-0011): чистая логика приёма — защитный разбор payload
// сокета и сшивка «донат → юзер TripTrek». Без БД и next/* — тесты рядом (donations.test.ts).
// Серверная половина (WS-клиент Centrifugo, ingest, уведомления админам) — donations-server.ts.
// Личности юзера DA не передаёт, поэтому сшивка эвристическая: @ник в сообщении доната
// (человек написал сам — сильный сигнал) или точное совпадение имени донатера с ником юзера.

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

/** Ник к сравнению: нижний регистр, края обрезаны, ведущие @ срезаны («@Leha» → «leha»). */
export function normalizeNick(s: string): string {
  return s
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

/** @ники из текста доната: слова после @ из букв/цифр/подчёркивания/дефиса (латиница+кириллица). */
export function extractNicks(message: string): string[] {
  const out: string[] = [];
  const re = /@([A-Za-zА-Яа-яЁё0-9_-]{2,32})/g;
  for (const m of message.matchAll(re)) {
    const nick = normalizeNick(m[1]);
    if (nick && !out.includes(nick)) out.push(nick);
  }
  return out;
}

/**
 * Сшивка доната с юзером: 1) @ник из сообщения совпал с ником юзера;
 * 2) имя донатера совпало с ником юзера (точное, без учёта регистра/@).
 * Не совпало — null: админ привяжет вручную, фолбэки «похожих» не предлагаем.
 */
export function matchDonationToUser(
  d: { donaterName: string | null; message: string | null },
  users: { id: string; name: string }[],
): string | null {
  if (users.length === 0) return null;

  if (d.message) {
    for (const nick of extractNicks(d.message)) {
      const hit = users.find((u) => normalizeNick(u.name) === nick);
      if (hit) return hit.id;
    }
  }
  if (d.donaterName) {
    const name = normalizeNick(d.donaterName);
    const hit = users.find((u) => normalizeNick(u.name) === name);
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
