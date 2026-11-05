import { createHash, timingSafeEqual } from "node:crypto";

export const WEBMONEY_MIN_CENTS = 100;
export const WEBMONEY_MAX_CENTS = 20_000;

/** Parse a decimal amount without floating-point rounding. */
export function parseWebMoneyAmount(value: unknown): number | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function isSupportedWebMoneyAmount(amountCents: number): boolean {
  return amountCents >= WEBMONEY_MIN_CENTS && amountCents <= WEBMONEY_MAX_CENTS;
}

export function formatWebMoneyAmount(amountCents: number): string {
  return `${Math.floor(amountCents / 100)}.${String(amountCents % 100).padStart(2, "0")}`;
}

export function paymentFormSignature(
  purse: string,
  amount: string,
  paymentNo: string,
  secretX20: string,
): string {
  return createHash("sha256")
    .update(`${purse};${amount};${paymentNo};${secretX20};`, "utf8")
    .digest("hex")
    .toUpperCase();
}

function safeHashEqual(actual: string | undefined, expected: string): boolean {
  if (!actual || !/^[\da-f]{64}$/i.test(actual)) return false;
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

/** Verify either SHA256 signature field documented by WebMoney (with/without separators). */
export function verifyPaymentResultSignature(
  fields: Record<string, string>,
  secret: string,
): boolean {
  const ordered = [
    fields.LMI_PAYEE_PURSE ?? "",
    fields.LMI_PAYMENT_AMOUNT ?? "",
    ...(fields.LMI_HOLD !== undefined ? [fields.LMI_HOLD] : []),
    fields.LMI_PAYMENT_NO ?? "",
    fields.LMI_MODE ?? "",
    fields.LMI_SYS_INVS_NO ?? "",
    fields.LMI_SYS_TRANS_NO ?? "",
    fields.LMI_SYS_TRANS_DATE ?? "",
    secret,
    fields.LMI_PAYER_PURSE ?? "",
    fields.LMI_PAYER_WM ?? "",
  ];

  return (
    safeHashEqual(fields.LMI_HASH2, createHash("sha256").update(ordered.join(";"), "utf8").digest("hex")) ||
    safeHashEqual(fields.LMI_HASH, createHash("sha256").update(ordered.join(""), "utf8").digest("hex"))
  );
}

export function parseWebMoneyTransactionDate(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
  if (
    date.getUTCFullYear() !== +year ||
    date.getUTCMonth() !== +month - 1 ||
    date.getUTCDate() !== +day ||
    date.getUTCHours() !== +hour ||
    date.getUTCMinutes() !== +minute ||
    date.getUTCSeconds() !== +second
  ) {
    return null;
  }
  return date;
}
