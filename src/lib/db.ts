import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// SQL-логи — только в dev; в прод достаточно error/warn.
// Синглтон — всегда (иначе в прод создаётся новый клиент на каждый модуль).
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['query'],
  })

globalForPrisma.prisma = db
