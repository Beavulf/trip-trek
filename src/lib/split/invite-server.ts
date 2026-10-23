import { randomInt } from "node:crypto";

// Код приглашения в группу: короткий, чтобы продиктовать голосом. Без похожих символов (0/O, 1/I/L).
// 31^8 ≈ 8,5·10^11 вариантов + rate limit на join — перебор нереален. Только сервер (node:crypto).
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return code;
}
