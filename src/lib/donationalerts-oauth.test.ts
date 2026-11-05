import { describe, expect, it } from "vitest";
import {
  DONATION_ALERTS_SCOPE,
  donationAlertsAuthorizeUrl,
  donationAlertsRedirectUri,
  parseDonationAlertsOAuthToken,
} from "./donationalerts-oauth";

describe("DonationAlerts OAuth helpers", () => {
  it("builds the registered HTTPS callback URL", () => {
    expect(donationAlertsRedirectUri("https://triptrek.example/")).toBe(
      "https://triptrek.example/api/admin/donations/oauth/callback",
    );
    expect(() => donationAlertsRedirectUri("http://triptrek.example")).toThrow("requires HTTPS");
    expect(donationAlertsRedirectUri("http://localhost:3000")).toBe(
      "http://localhost:3000/api/admin/donations/oauth/callback",
    );
    expect(() => donationAlertsRedirectUri("ftp://localhost")).toThrow("requires HTTPS");
  });

  it("builds an authorization URL with the requested scope and state", () => {
    const url = new URL(
      donationAlertsAuthorizeUrl(
        "12345",
        "https://triptrek.example/api/admin/donations/oauth/callback",
        "random-state",
      ),
    );
    expect(url.origin + url.pathname).toBe("https://www.donationalerts.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("12345");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://triptrek.example/api/admin/donations/oauth/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(DONATION_ALERTS_SCOPE).toBe("oauth-user-show oauth-donation-subscribe");
    expect(url.searchParams.get("scope")).toBe("oauth-user-show oauth-donation-subscribe");
    expect(url.searchParams.get("state")).toBe("random-state");
  });

  it("parses valid token responses and rejects malformed or unsafe expirations", () => {
    const token = parseDonationAlertsOAuthToken(
      { access_token: "access", refresh_token: "refresh", expires_in: 60 },
      1000,
    );
    expect(token).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: new Date(61_000),
    });
    expect(parseDonationAlertsOAuthToken({ access_token: "x", expires_in: 0 })).toBeNull();
    expect(parseDonationAlertsOAuthToken({ access_token: "x", expires_in: Number.MAX_VALUE })).toBeNull();
  });
});
