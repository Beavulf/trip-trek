import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api-auth";
import { userRateLimit } from "@/lib/rate-limit";
import { normalizeWmzPurse } from "@/lib/support";
import {
  formatWebMoneyAmount,
  isSupportedWebMoneyAmount,
  parseWebMoneyAmount,
  paymentFormSignature,
} from "@/lib/webmoney";

const MERCHANT_URL = "https://merchant.webmoney.com/lmi/payment_utf.asp";

export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(req);
  if (response) return response;

  const limited = userRateLimit(req, user.id, "webmoney-checkout", 5, 60_000);
  if (limited) return limited;

  const body: unknown = await req.json().catch(() => null);
  const amountCents = typeof body === "object" && body !== null
    ? parseWebMoneyAmount((body as Record<string, unknown>).amount)
    : null;
  if (amountCents === null || !isSupportedWebMoneyAmount(amountCents)) {
    return NextResponse.json({ error: "Укажите сумму от $1.00 до $200.00" }, { status: 400 });
  }

  const settings = await db.appSettings.findUnique({
    where: { id: "app" },
    select: {
      webmoneyPurse: true,
      webmoneyMerchantSecret: true,
      webmoneyMerchantSecretX20: true,
    },
  });
  const purse = normalizeWmzPurse(settings?.webmoneyPurse);
  const secret = settings?.webmoneyMerchantSecret;
  const secretX20 = settings?.webmoneyMerchantSecretX20;
  if (!purse || !secret || !secretX20) {
    return NextResponse.json({ error: "Оплата WebMoney Merchant пока не настроена" }, { status: 503 });
  }

  const appUrl = process.env.NEXTAUTH_URL;
  if (!appUrl) {
    return NextResponse.json({ error: "На сервере не задан NEXTAUTH_URL" }, { status: 503 });
  }
  let resultUrl: URL;
  try {
    resultUrl = new URL("/api/payments/webmoney/result", appUrl);
  } catch {
    return NextResponse.json({ error: "Некорректный NEXTAUTH_URL" }, { status: 503 });
  }
  if (resultUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "WebMoney Merchant требует HTTPS для Result URL" }, { status: 503 });
  }

  const paymentNo = String(randomInt(1_000_000_000, 9_999_999_999));
  const payment = await db.webMoneyPayment.create({
    data: { paymentNo, userId: user.id, amountCents },
    select: { paymentNo: true },
  });
  const amount = formatWebMoneyAmount(amountCents);

  return NextResponse.json({
    action: MERCHANT_URL,
    fields: {
      LMI_PAYEE_PURSE: purse,
      LMI_PAYMENT_AMOUNT: amount,
      LMI_PAYMENT_NO: payment.paymentNo,
      LMI_PAYMENT_DESC: "Добровольная поддержка TripTrek",
      LMI_SIM_MODE: "0",
      LMI_PAYMENTFORM_SIGN: paymentFormSignature(purse, amount, payment.paymentNo, secretX20),
    },
  });
}
