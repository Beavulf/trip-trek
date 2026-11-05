import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  donationAlertsAuthorizeUrl,
  donationAlertsRedirectUri,
} from "@/lib/donationalerts-oauth";
import { db } from "@/lib/db";

const STATE_COOKIE = "triptrek-da-oauth-state";

export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const settings = await db.appSettings.findUnique({
    where: { id: "app" },
    select: { donationAlertsClientId: true, donationAlertsClientSecret: true },
  });
  const appUrl = process.env.NEXTAUTH_URL;
  if (!appUrl) {
    return NextResponse.json({ error: "На сервере не задан NEXTAUTH_URL" }, { status: 503 });
  }
  if (!settings?.donationAlertsClientId || !settings.donationAlertsClientSecret) {
    return NextResponse.redirect(new URL("/admin/settings?donationAlerts=missing_credentials", appUrl));
  }

  let redirectUri: string;
  try {
    redirectUri = donationAlertsRedirectUri(appUrl);
  } catch {
    return NextResponse.json({ error: "Некорректный NEXTAUTH_URL для OAuth" }, { status: 503 });
  }

  const state = randomBytes(32).toString("base64url");
  const result = NextResponse.redirect(
    donationAlertsAuthorizeUrl(settings.donationAlertsClientId, redirectUri, state),
  );
  result.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: new URL(appUrl).protocol === "https:",
    sameSite: "lax",
    path: "/api/admin/donations/oauth/callback",
    maxAge: 10 * 60,
  });
  return result;
}
