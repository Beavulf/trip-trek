import type { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../src/lib/api-auth";

// Handshake-аутентификация socket.io: тот же JWT из cookie next-auth.session-token,
// что проверяют HTTP-маршруты (src/lib/api-auth.ts). Без валидного токена
// подключение отбивается сразу — анонимных сокетов не существует.
type HandshakeNext = (err?: Error) => void;

export function wsHandshakeAuth(socket: Socket, next: HandshakeNext): void {
  try {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const token = /(?:^|;\s*)next-auth\.session-token=([^;]+)/.exec(cookieHeader)?.[1];
    if (!token) return next(new Error("unauthorized"));
    const payload = jwt.verify(decodeURIComponent(token), getJwtSecret()) as {
      id?: string;
      sub?: string;
    };
    const userId = payload.id || payload.sub;
    if (!userId) return next(new Error("unauthorized"));
    socket.data.userId = userId;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
}
