// Политика пароля: одно правило для сервера (register, сброс, смена) и для форм в браузере.
// Отдельный файл без bcrypt/БД, чтобы клиентский код мог его импортировать (password.ts — серверный).

export const PASSWORD_HINT = "Минимум 8 символов, буквы и цифры";

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
