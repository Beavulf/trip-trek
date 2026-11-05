export const DONATION_ALERTS_AUTHORIZE_URL = "https://www.donationalerts.com/oauth/authorize";
export const DONATION_ALERTS_TOKEN_URL = "https://www.donationalerts.com/oauth/token";
export const DONATION_ALERTS_SCOPE = "oauth-user-show oauth-donation-subscribe";
export const DONATION_ALERTS_CALLBACK_PATH = "/api/admin/donations/oauth/callback";

export interface DonationAlertsOAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export function donationAlertsRedirectUri(appUrl: string): string {
  const base = new URL(appUrl);
  const isLocalHttp =
    base.protocol === "http:" && (base.hostname === "localhost" || base.hostname === "127.0.0.1");
  if ((base.protocol !== "https:" && !isLocalHttp) || base.username || base.password) {
    throw new Error("DonationAlerts OAuth requires HTTPS");
  }
  return new URL(DONATION_ALERTS_CALLBACK_PATH, base).toString();
}

export function donationAlertsAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const url = new URL(DONATION_ALERTS_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DONATION_ALERTS_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export function parseDonationAlertsOAuthToken(
  value: unknown,
  now = Date.now(),
): DonationAlertsOAuthToken | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.access_token !== "string" ||
    !body.access_token.trim() ||
    typeof body.expires_in !== "number" ||
    !Number.isSafeInteger(body.expires_in) ||
    body.expires_in <= 0 ||
    (body.refresh_token !== undefined && typeof body.refresh_token !== "string")
  ) {
    return null;
  }
  const expiresAt = new Date(now + body.expires_in * 1000);
  if (!Number.isFinite(expiresAt.getTime())) return null;
  return {
    accessToken: body.access_token,
    refreshToken:
      typeof body.refresh_token === "string" && body.refresh_token.trim()
        ? body.refresh_token
        : undefined,
    expiresAt,
  };
}

export async function exchangeDonationAlertsCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<DonationAlertsOAuthToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  const response = await fetch(DONATION_ALERTS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`DonationAlerts token exchange failed (${response.status})`);
  const token = parseDonationAlertsOAuthToken(await response.json());
  if (!token) throw new Error("DonationAlerts returned an invalid OAuth token");
  return token;
}

export async function refreshDonationAlertsToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<DonationAlertsOAuthToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    scope: DONATION_ALERTS_SCOPE,
  });
  const response = await fetch(DONATION_ALERTS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`DonationAlerts token refresh failed (${response.status})`);
  const token = parseDonationAlertsOAuthToken(await response.json());
  if (!token) throw new Error("DonationAlerts returned an invalid refreshed OAuth token");
  return token;
}
