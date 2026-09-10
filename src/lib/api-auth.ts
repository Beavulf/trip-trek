import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";

// ============================================
// API Auth Helpers
// ============================================
// Custom JWT auth (bypasses NextAuth v4 Turbopack issues)
// Cookie: "next-auth.session-token" contains JWT signed with NEXTAUTH_SECRET
// ============================================

interface AuthUser {
  id: string;
  name: string;
  email: string;
  emoji?: string;
  color?: string;
  plan?: string;
}

/**
 * Get the JWT signing secret.
 * In production, throws if NEXTAUTH_SECRET is not set (no insecure fallback).
 * In dev/test, falls back to "fallback-dev-secret" with a warning.
 */
export function getJwtSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXTAUTH_SECRET is required in production. Generate one with: openssl rand -hex 32"
      );
    }
    console.warn(
      "[triptrek] NEXTAUTH_SECRET is not set — using insecure fallback secret. " +
        "Set NEXTAUTH_SECRET for production deployments."
    );
    return "fallback-dev-secret";
  }
  return secret;
}

/**
 * Extract user from request cookie (JWT)
 * Returns null if not authenticated
 */
export async function getUserFromRequest(req: NextRequest): Promise<AuthUser | null> {
  try {
    const token = req.cookies.get("next-auth.session-token")?.value;
    if (!token) return null;

    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as AuthUser;

    if (!decoded?.id) return null;

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Require authenticated user.
 * Returns { user, response } — if response is not null, return it (401).
 * Usage:
 *   const { user, response } = await requireUser(req);
 *   if (response) return response;
 *   // user is guaranteed to be non-null here
 */
export async function requireUser(req: NextRequest): Promise<{ user: AuthUser; response: null } | { user: null; response: NextResponse }> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user, response: null };
}

/**
 * Require authenticated user + trip membership.
 * Checks that the user is a member of the specified trip.
 * Returns { user, membership, response } — if response is not null, return it (401/403).
 * Usage:
 *   const { user, membership, response } = await requireTripMember(req, tripId);
 *   if (response) return response;
 */
export async function requireTripMember(
  req: NextRequest,
  tripId: string
): Promise<{
  user: AuthUser;
  membership: { id: string; role: string };
  response: null;
} | {
  user: null;
  membership: null;
  response: NextResponse;
}> {
  const { user, response } = await requireUser(req);
  if (response) return { user: null, membership: null, response };

  // Check membership
  const member = await db.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: user!.id } },
    select: { id: true, role: true },
  });

  if (!member) {
    return {
      user: null,
      membership: null,
      response: NextResponse.json({ error: "Not a member of this trip" }, { status: 403 }),
    };
  }

  return { user: user!, membership: member, response: null };
}

/**
 * Require authenticated user + trip ownership.
 * Checks that the user is the owner of the specified trip.
 */
export async function requireTripOwner(
  req: NextRequest,
  tripId: string
): Promise<{
  user: AuthUser;
  membership: { id: string; role: string };
  response: null;
} | {
  user: null;
  membership: null;
  response: NextResponse;
}> {
  const result = await requireTripMember(req, tripId);
  if (result.response) return result;

  if (result.membership!.role !== "owner") {
    return {
      user: null,
      membership: null,
      response: NextResponse.json({ error: "Only trip owner can do this" }, { status: 403 }),
    };
  }

  return result;
}

/**
 * Require authenticated admin (User.role === "admin").
 * Роль всегда читается из БД, а не из JWT: существующие токены живут 30 дней
 * и поля role не содержат — проверка по токену оставила бы админом пониженного.
 */
export async function requireAdmin(req: NextRequest): Promise<
  { user: AuthUser; response: null } | { user: null; response: NextResponse }
> {
  const { user, response } = await requireUser(req);
  if (response) return { user: null, response };

  const row = await db.user.findUnique({
    where: { id: user!.id },
    select: { role: true },
  });

  if (row?.role !== "admin") {
    return {
      user: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { user: user!, response: null };
}
