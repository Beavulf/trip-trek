import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

// Проверка пароля через bcrypt
function verifyPassword(password: string, hash: string): boolean {
  try {
    if (!hash || !(hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$"))) {
      return false;
    }
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
        process.stderr.write("[AUTH] authorize called\n");
        if (!credentials?.email || !credentials?.password) {
          process.stderr.write("[AUTH] no credentials\n");
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });

        console.log("[AUTH] user found:", !!user, user?.email);
        if (!user || !user.password) {
          console.log("[AUTH] no user or password");
          return null;
        }

        const isValid = verifyPassword(credentials.password, user.password);
        console.log("[AUTH] password valid:", isValid);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          emoji: user.emoji,
          color: user.color,
          plan: user.plan,
        } as { id: string; name: string; email: string; emoji?: string; color?: string; plan?: string };
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
        token.emoji = (user as { emoji?: string }).emoji;
        token.color = (user as { color?: string }).color;
        token.plan = (user as { plan?: string }).plan;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { emoji?: string }).emoji = token.emoji as string;
        (session.user as { color?: string }).color = token.color as string;
        (session.user as { plan?: string }).plan = token.plan as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
