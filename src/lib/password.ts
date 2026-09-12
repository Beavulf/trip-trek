import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notify";
import { sendMail } from "@/lib/mail/mailer";
import { passwordChangedEmail } from "@/lib/mail/templates";

// Пароль — единая точка записи. Любой сценарий (сброс по ссылке, смена в профиле,
// смена админом) проходит через changePassword: хеш + passwordChangedAt +
// сжигание ссылок сброса + уведомления. Проверка старого пароля и авторизация —
// забота вызывающего роута.

/** Русский текст ошибки или null, если пароль проходит политику (как в register). */
export function validatePasswordPolicy(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "Пароль минимум 8 символов";
  }
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
    return "Пароль должен содержать буквы и цифры";
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Записать новый пароль пользователю и сделать всё, что из этого следует.
 * Сам не проверяет права и старый пароль. Никогда не бросает после записи пароля.
 */
export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const password = await hashPassword(newPassword);
  const passwordChangedAt = new Date();

  const user = await db.user.update({
    where: { id: userId },
    data: { password, passwordChangedAt },
    select: { email: true, name: true },
  });

  // Живые ссылки сброса умирают вместе со старым паролем
  await db.passwordResetToken.deleteMany({ where: { userId } }).catch(() => {});

  // Колокольчик в приложении. Формулировка нейтральная: подходит и смене
  // самого пользователем, и сбросу по ссылке, и замене пароля админом
  // (notifyUser никогда не бросает)
  await notifyUser(userId, {
    type: "password",
    title: "Пароль вашего аккаунта изменён",
    body: "Если вы меняли пароль — всё в порядке. Если нет — срочно свяжитесь с админом через «Сообщить о проблеме».",
  });

  // Письмо дублирует колокольчик; без SMTP_HOST sendMail тихо пропустит отправку
  void sendMail({ to: user.email, ...passwordChangedEmail(user.name) });
}
