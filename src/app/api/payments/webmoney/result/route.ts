import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyUser } from "@/lib/notify";
import { formatDonationLine } from "@/lib/donations";
import { normalizeWmzPurse } from "@/lib/support";
import {
  parseWebMoneyAmount,
  parseWebMoneyTransactionDate,
  verifyPaymentResultSignature,
} from "@/lib/webmoney";

function merchantReply(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function formFields(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    logger.warn("webmoney: oversized Result URL request");
    return merchantReply("NO", 413);
  }

  let fields: Record<string, string>;
  try {
    fields = formFields(await req.formData());
  } catch {
    logger.warn("webmoney: invalid Result URL form data");
    return merchantReply("NO", 400);
  }

  // Merchant may first make a parameter-less availability probe when preflight fields are disabled.
  if (Object.keys(fields).length === 0) return merchantReply("OK");

  const paymentNo = fields.LMI_PAYMENT_NO;
  const amountCents = parseWebMoneyAmount(fields.LMI_PAYMENT_AMOUNT);
  const settings = await db.appSettings.findUnique({
    where: { id: "app" },
    select: {
      webmoneyPurse: true,
      webmoneyMerchantSecret: true,
    },
  });
  const purse = normalizeWmzPurse(settings?.webmoneyPurse);
  const secret = settings?.webmoneyMerchantSecret;
  if (!purse || !secret) {
    logger.error("webmoney: Result URL called without Merchant settings", { paymentNo });
    return merchantReply("NO", 503);
  }

  if (fields.LMI_PREREQUEST === "1") {
    const payment = paymentNo
      ? await db.webMoneyPayment.findUnique({ where: { paymentNo }, select: { amountCents: true, status: true } })
      : null;
    const amountMatches = amountCents !== null && payment?.amountCents === amountCents;
    if (
      payment?.status === "pending" &&
      amountMatches &&
      fields.LMI_PAYEE_PURSE === purse &&
      fields.LMI_MODE === "0"
    ) {
      return merchantReply("YES");
    }
    logger.warn("webmoney: preflight rejected", { paymentNo });
    return merchantReply("NO", 400);
  }

  if (!paymentNo || !amountCents || !fields.LMI_SYS_TRANS_NO || !fields.LMI_SYS_INVS_NO || !fields.LMI_SYS_TRANS_DATE) {
    logger.warn("webmoney: incomplete payment result", { paymentNo });
    return merchantReply("NO", 400);
  }
  if (
    fields.LMI_MODE !== "0" ||
    fields.LMI_PAYEE_PURSE !== purse ||
    (fields.LMI_SECRET_KEY !== undefined && fields.LMI_SECRET_KEY !== secret) ||
    !verifyPaymentResultSignature(fields, secret)
  ) {
    logger.warn("webmoney: payment result verification failed", { paymentNo });
    return merchantReply("NO", 400);
  }

  const donatedAt = parseWebMoneyTransactionDate(fields.LMI_SYS_TRANS_DATE);
  if (!donatedAt) {
    logger.warn("webmoney: invalid transaction date", { paymentNo });
    return merchantReply("NO", 400);
  }

  const result = await db.$transaction(async (tx) => {
    const payment = await tx.webMoneyPayment.findUnique({ where: { paymentNo } });
    if (!payment) return { kind: "missing" as const };
    if (payment.status === "paid") {
      return payment.sysTransNo === fields.LMI_SYS_TRANS_NO
        ? { kind: "duplicate" as const, userId: payment.userId }
        : { kind: "conflict" as const };
    }
    if (payment.status !== "pending" || payment.amountCents !== amountCents) {
      return { kind: "conflict" as const };
    }

    const claimed = await tx.webMoneyPayment.updateMany({
      where: { id: payment.id, status: "pending" },
      data: { status: "paid", sysTransNo: fields.LMI_SYS_TRANS_NO, paidAt: donatedAt },
    });
    if (claimed.count !== 1) {
      const current = await tx.webMoneyPayment.findUnique({ where: { id: payment.id } });
      return current?.status === "paid" && current.sysTransNo === fields.LMI_SYS_TRANS_NO
        ? { kind: "duplicate" as const, userId: current.userId }
        : { kind: "conflict" as const };
    }

    const user = payment.userId
      ? await tx.user.findUnique({ where: { id: payment.userId }, select: { id: true, name: true } })
      : null;
    const donation = await tx.donation.create({
      data: {
        externalId: `webmoney:${payment.paymentNo}`,
        source: "webmoney",
        donaterName: user?.name ?? null,
        message: null,
        amountCents: payment.amountCents,
        currency: "USD",
        donatedAt,
        matchedUserId: user?.id ?? null,
        matchedBy: user ? "webmoney" : null,
      },
      select: { id: true },
    });
    await tx.webMoneyPayment.update({
      where: { id: payment.id },
      data: { donationId: donation.id },
    });
    return { kind: "paid" as const, userId: user?.id ?? null, userName: user?.name ?? null };
  });

  if (result.kind === "missing" || result.kind === "conflict") {
    logger.warn("webmoney: payment order not payable", { paymentNo, result: result.kind });
    return merchantReply("NO", 400);
  }
  if (result.kind === "duplicate") return merchantReply("YES");

  const donationLine = formatDonationLine({
    donaterName: result.userName ?? null,
    amountCents,
    currency: "USD",
    message: null,
  });
  try {
    const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true } });
    await Promise.allSettled(
      admins.map((admin) =>
        notifyUser(admin.id, {
          type: "donation",
          title: "❤️ Новый донат через WebMoney",
          body: donationLine,
          url: "/admin/donations",
        }),
      ),
    );
  } catch (error) {
    logger.error("webmoney: failed to load admins for donation notification", {
      paymentNo,
      error: String(error),
    });
  }
  if (result.userId) {
    await notifyUser(result.userId, {
      type: "donation",
      title: "❤️ Спасибо за поддержку!",
      body: "Платёж WebMoney подтверждён, бейдж добавлен в профиль.",
      url: "/",
    });
  }

  logger.info("webmoney: payment confirmed", {
    paymentNo,
    amountCents,
    transactionNo: fields.LMI_SYS_TRANS_NO,
    matched: Boolean(result.userId),
  });
  return merchantReply("YES");
}
