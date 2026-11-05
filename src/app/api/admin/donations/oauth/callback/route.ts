import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";
import {
  donationAlertsRedirectUri,
  exchangeDonationAlertsCode,
} from "@/lib/donationalerts-oauth";
import { checkDonationToken, refreshDonationAlertsConnection } from "@/lib/donations-server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const STATE_COOKIE = "triptrek-da-oauth-state";

function redirectToSettings(baseUrl: string, result: string): NextResponse {
  const redirect = NextResponse.redirect(new URL(`/admin/settings?donationAlerts=${result}`, baseUrl));
  redirect.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: new URL(baseUrl).protocol === "https:",
    sameSite: "lax",
    path: "/api/admin/donations/oauth/callback",
    maxAge: 0,
  });
  return redirect;
}

export async function GET(req: NextRequest) {
  const { user, response } = await requireAdmin(req);
  if (response) return response;

  const appUrl = process.env.NEXTAUTH_URL;
  if (!appUrl) return NextResponse.json({ error: "На сервере не задан NEXTAUTH_URL" }, { status: 503 });

  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  const receivedState = req.nextUrl.searchParams.get("state");
  const validState =
    !!expectedState &&
    !!receivedState &&
    expectedState.length === receivedState.length &&
    timingSafeEqual(Buffer.from(expectedState), Buffer.from(receivedState));
  if (!validState) return redirectToSettings(appUrl, "invalid_state");

  if (req.nextUrl.searchParams.has("error")) return redirectToSettings(appUrl, "denied");
  const code = req.nextUrl.searchParams.get("code");
  if (!code || code.length > 4096) return redirectToSettings(appUrl, "failed");

  const settings = await db.appSettings.findUnique({
    where: { id: "app" },
    select: {
      donationAlertsClientId: true,
      donationAlertsClientSecret: true,
    },
  });
  if (!settings?.donationAlertsClientId || !settings.donationAlertsClientSecret) {
    return redirectToSettings(appUrl, "missing_credentials");
  }

  try {
    const redirectUri = donationAlertsRedirectUri(appUrl);
    const token = await exchangeDonationAlertsCode({
      clientId: settings.donationAlertsClientId,
      clientSecret: settings.donationAlertsClientSecret,
      redirectUri,
      code,
    });
    const account = await checkDonationToken(token.accessToken);
    if (!account.ok) {
      return redirectToSettings(appUrl, "token_rejected");
    }

    await db.appSettings.upsert({
      where: { id: "app" },
      update: {
        donationAlertsToken: token.accessToken,
        donationAlertsRefreshToken: token.refreshToken ?? null,
        donationAlertsTokenExpiresAt: token.expiresAt,
      },
      create: {
        id: "app",
        donationAlertsToken: token.accessToken,
        donationAlertsRefreshToken: token.refreshToken ?? null,
        donationAlertsTokenExpiresAt: token.expiresAt,
      },
    });
    await logAdmin(user.id, "settings.donations_oauth", { type: "settings", label: "DonationAlerts OAuth" }, {
      account: account.account,
      tokenSet: true,
    });
    refreshDonationAlertsConnection();
    return redirectToSettings(appUrl, "connected");
  } catch (error) {
    logger.error("DonationAlerts OAuth callback failed", { error: String(error) });
    return redirectToSettings(appUrl, "failed");
  }
}
