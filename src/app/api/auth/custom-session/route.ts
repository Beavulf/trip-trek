import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "@/lib/api-auth";

// GET /api/auth/custom-session — кастомная сессия (читает наш JWT)
export async function GET(req: NextRequest) {
  const token = req.cookies.get("next-auth.session-token")?.value;
  
  if (!token) {
    return NextResponse.json({ user: null });
  }

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as {
      id: string;
      name: string;
      email: string;
      emoji?: string;
      color?: string;
      plan?: string;
    };

    return NextResponse.json({
      user: {
        id: decoded.id,
        name: decoded.name,
        email: decoded.email,
        emoji: decoded.emoji || "👤",
        color: decoded.color || "#94a3b8",
        plan: decoded.plan || "free",
      },
    });
  } catch {
    // Invalid token
    return NextResponse.json({ user: null });
  }
}
