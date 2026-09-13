import type { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../src/lib/api-auth";
import { db } from "../src/lib/db";

// Handshake-аутентификация socket.io: тот же JWT из cookie next-auth.session-token,
// что проверяют HTTP-маршруты (src/lib/api-auth.ts). Без валидного токена
// подключение отбивается сразу — анонимных сокетов не существует.
type HandshakeNext = (err?: Error) => void;

export async function wsHandshakeAuth(socket: Socket, next: HandshakeNext): Promise<void> {
  try {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const token = /(?:^|;\s*)next-auth\.session-token=([^;]+)/.exec(cookieHeader)?.[1];
    if (!token) return next(new Error("unauthorized"));
    const payload = jwt.verify(decodeURIComponent(token), getJwtSecret()) as {
      id?: string;
      sub?: string;
      iat?: number;
    };
    const userId = payload.id || payload.sub;
    if (!userId) return next(new Error("unauthorized"));

    // Тот же инвариант ревокации, что в HTTP-гардах (api-auth.ts): токен,
    // выпущенный до смены пароля, не должен жить и на WS-канале — иначе
    // украденный токен получал бы события поездки ещё 30 дней после сброса
    // (аудит 2026-09-12). Заодно проверяем, что юзер существует.
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { passwordChangedAt: true },
    });
    if (!user) return next(new Error("unauthorized"));
    if (user.passwordChangedAt && (payload.iat ?? 0) * 1000 < user.passwordChangedAt.getTime()) {
      return next(new Error("unauthorized"));
    }

    socket.data.userId = userId;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
}
