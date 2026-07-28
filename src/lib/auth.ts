import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import crypto from "crypto";

// Простой hash проверка без bcrypt (надёжнее в Turbopack)
function verifyPassword(password: string, hash: string): boolean {
  try {
    // Если хеш от bcrypt — пробуем bcrypt
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$")) {
      // Динамический импорт bcryptjs
      return bcryptCompareSync(password, hash);
    }
    return false;
  } catch {
    return false;
  }
}

// Динамический импорт bcryptjs
function bcryptCompareSync(password: string, hash: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bcrypt = require("bcryptjs");
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          return null;
        }

        const isValid = verifyPassword(credentials.password, user.password);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
