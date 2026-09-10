// Выдать роль admin указанному email (админка /admin станет доступна после его следующего входа).
// Использование: npm run db:admin -- you@example.com
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.toLowerCase().trim();
if (!email) {
  console.error("Использование: npm run db:admin -- <email>");
  process.exit(1);
}

const db = new PrismaClient();
const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });

if (!user) {
  console.error(`Пользователь ${email} не найден — сначала зарегистрируйся в приложении`);
  process.exit(1);
}
if (user.role === "admin") {
  console.log(`${email} уже админ`);
} else {
  await db.user.update({ where: { id: user.id }, data: { role: "admin" } });
  console.log(`✅ ${email} теперь админ`);
}
await db.$disconnect();
