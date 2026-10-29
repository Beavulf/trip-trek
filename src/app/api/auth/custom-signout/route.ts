import { NextRequest, NextResponse } from "next/server";
import { LANDING_SEEN_COOKIE } from "@/app/landing/showcase";

// POST /api/auth/custom-signout — выход (удаляет cookie)
export async function POST(req: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("next-auth.session-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  // Метка «своих»: после выхода форма входа открывается как обычно, без временного редиректа на лендинг
  response.cookies.set(LANDING_SEEN_COOKIE, "1", {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}
