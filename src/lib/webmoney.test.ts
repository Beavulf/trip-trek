import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  formatWebMoneyAmount,
  isSupportedWebMoneyAmount,
  parseWebMoneyAmount,
  parseWebMoneyTransactionDate,
  paymentFormSignature,
  verifyPaymentResultSignature,
} from "./webmoney";

describe("WebMoney amount helpers", () => {
  it("parses exact cents and rejects invalid decimal formats", () => {
    expect(parseWebMoneyAmount("1")).toBe(100);
    expect(parseWebMoneyAmount("12.5")).toBe(1250);
    expect(parseWebMoneyAmount("200.00")).toBe(20_000);
    expect(parseWebMoneyAmount("0.99")).toBe(99);
    expect(parseWebMoneyAmount("201")).toBe(20_100);
    for (const value of ["", "01", "1.001", "-1", "1,5", "1e2", "1."]) {
      expect(parseWebMoneyAmount(value)).toBeNull();
    }
    expect(isSupportedWebMoneyAmount(99)).toBe(false);
    expect(isSupportedWebMoneyAmount(100)).toBe(true);
    expect(isSupportedWebMoneyAmount(20_000)).toBe(true);
    expect(isSupportedWebMoneyAmount(20_001)).toBe(false);
  });

  it("formats cents as a two-decimal Merchant amount", () => {
    expect(formatWebMoneyAmount(100)).toBe("1.00");
    expect(formatWebMoneyAmount(12_345)).toBe("123.45");
  });
});

describe("WebMoney signatures", () => {
  const fields: Record<string, string> = {
    LMI_PAYEE_PURSE: "Z123456789012",
    LMI_PAYMENT_AMOUNT: "5.00",
    LMI_PAYMENT_NO: "1234567890",
    LMI_MODE: "0",
    LMI_SYS_INVS_NO: "12",
    LMI_SYS_TRANS_NO: "34",
    LMI_SYS_TRANS_DATE: "20261105 10:00:00",
    LMI_PAYER_PURSE: "Z987654321098",
    LMI_PAYER_WM: "123456789012",
  };
  const secret = "merchant-secret";

  it("creates the SHA256 payment-form signature using Secret Key X20", () => {
    const expected = createHash("sha256")
      .update("Z123456789012;5.00;1234567890;secret-x20;", "utf8")
      .digest("hex")
      .toUpperCase();
    expect(paymentFormSignature("Z123456789012", "5.00", "1234567890", "secret-x20")).toBe(expected);
  });

  it("verifies the semicolon SHA256 result signature", () => {
    const hash = createHash("sha256")
      .update(`${Object.values(fields).slice(0, 3).join(";")};${Object.values(fields).slice(3, 7).join(";")};${secret};${Object.values(fields).slice(7).join(";")}`, "utf8")
      .digest("hex");
    expect(verifyPaymentResultSignature({ ...fields, LMI_HASH2: hash }, secret)).toBe(true);
    expect(verifyPaymentResultSignature({ ...fields, LMI_HASH2: "0".repeat(64) }, secret)).toBe(false);
  });

  it("verifies the SHA256 result signature without separators and handles optional hold", () => {
    const withHold: Record<string, string> = { ...fields, LMI_HOLD: "1" };
    const ordered = [
      withHold.LMI_PAYEE_PURSE,
      withHold.LMI_PAYMENT_AMOUNT,
      withHold.LMI_HOLD,
      withHold.LMI_PAYMENT_NO,
      withHold.LMI_MODE,
      withHold.LMI_SYS_INVS_NO,
      withHold.LMI_SYS_TRANS_NO,
      withHold.LMI_SYS_TRANS_DATE,
      secret,
      withHold.LMI_PAYER_PURSE,
      withHold.LMI_PAYER_WM,
    ];
    const hash = createHash("sha256").update(ordered.join(""), "utf8").digest("hex").toUpperCase();
    expect(verifyPaymentResultSignature({ ...withHold, LMI_HASH: hash }, secret)).toBe(true);
    expect(verifyPaymentResultSignature({ ...withHold, LMI_HASH: "bad" }, secret)).toBe(false);
  });
});

describe("parseWebMoneyTransactionDate", () => {
  it("parses WebMoney UTC timestamps and rejects invalid dates", () => {
    expect(parseWebMoneyTransactionDate("20261105 10:00:00")?.toISOString()).toBe("2026-11-05T10:00:00.000Z");
    expect(parseWebMoneyTransactionDate("20260230 10:00:00")).toBeNull();
    expect(parseWebMoneyTransactionDate("bad")).toBeNull();
  });
});
