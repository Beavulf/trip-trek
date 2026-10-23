// src/lib/invite-code.ts
import { randomInt } from "node:crypto";

// Инвайт-коды приложения (бета-доступ): чистые функции. Занятие слота — атомарный
// updateMany в роуте регистрации; здесь только генерация, нормализация и статус
// для отображения в админке.

// Алфавит без похожих символов (нет I/O/0/1) — код читают с экрана и диктуют голосом
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode(length = INVITE_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

// Ввод нормализуем так же, как инвайт-коды поездок: регистр и пробелы не мешают
export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export type InviteStatus = "active" | "expired" | "deactivated" | "exhausted";

/** Статус для списка в админке; решение «можно ли занять слот» принимает updateMany в БД */
export function inviteCodeStatus(
  code: { maxUses: number; usedCount: number; expiresAt: Date | null; deactivatedAt: Date | null },
  now = new Date()
): InviteStatus {
  if (code.deactivatedAt) return "deactivated";
  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) return "expired";
  if (code.usedCount >= code.maxUses) return "exhausted";
  return "active";
}
