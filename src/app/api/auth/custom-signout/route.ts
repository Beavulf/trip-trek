import { NextRequest, NextResponse } from "next/server";

// POST /api/auth/custom-signout — выход (удаляет cookie)
export async function POST(req: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("next-auth.session-token", "", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
