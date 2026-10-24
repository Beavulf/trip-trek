import { describe, expect, it } from "vitest";
import { isInviteError, serverErrorText, validateAuthForm, type AuthFormInput } from "./auth-form";

const reg: AuthFormInput = {
  mode: "register",
  name: "Аня",
  email: "anya@example.com",
  password: "abc12345",
  invite: "ABCD2345",
  inviteRequired: true,
};

describe("validateAuthForm: регистрация", () => {
  it("полная верная форма проходит", () => {
    expect(validateAuthForm(reg)).toBeNull();
  });

  it("имя, код, email и пароль проверяются по порядку", () => {
    expect(validateAuthForm({ ...reg, name: "  " })).toBe("Введите имя");
    expect(validateAuthForm({ ...reg, invite: " " })).toMatch(/инвайт-код/);
    expect(validateAuthForm({ ...reg, email: "" })).toBe("Введите email");
    expect(validateAuthForm({ ...reg, email: "anya@" })).toMatch(/опечатка/);
    expect(validateAuthForm({ ...reg, password: "" })).toBe("Введите пароль");
  });

  it("код не требуется, если режим выключен или неизвестен", () => {
    expect(validateAuthForm({ ...reg, invite: "", inviteRequired: false })).toBeNull();
    expect(validateAuthForm({ ...reg, invite: "", inviteRequired: null })).toBeNull();
  });

  it("политика пароля — та же, что на сервере", () => {
    expect(validateAuthForm({ ...reg, password: "abc123" })).toBe("Пароль минимум 8 символов");
    expect(validateAuthForm({ ...reg, password: "abcdefgh" })).toBe("Пароль должен содержать буквы и цифры");
    expect(validateAuthForm({ ...reg, password: "12345678" })).toBe("Пароль должен содержать буквы и цифры");
  });

  it("email с пробелами по краям допустим (сервер делает trim)", () => {
    expect(validateAuthForm({ ...reg, email: "  anya@example.com " })).toBeNull();
  });
});

describe("validateAuthForm: вход", () => {
  const login: AuthFormInput = { ...reg, mode: "login", name: "", invite: "", password: "x" };

  it("на входе имя и код не нужны, пароль не проверяется на политику (старые аккаунты)", () => {
    expect(validateAuthForm(login)).toBeNull();
  });

  it("пустые поля дают понятную ошибку", () => {
    expect(validateAuthForm({ ...login, email: "" })).toBe("Введите email");
    expect(validateAuthForm({ ...login, password: "" })).toBe("Введите пароль");
  });
});

describe("serverErrorText", () => {
  it("берёт текст из тела ответа", () => {
    expect(serverErrorText(400, { error: "Этот email уже зарегистрирован" })).toBe("Этот email уже зарегистрирован");
  });

  it("если тела нет, говорит по статусу", () => {
    expect(serverErrorText(429, null)).toMatch(/Слишком много/);
    expect(serverErrorText(502, {})).toMatch(/недоступен/);
    expect(serverErrorText(418, undefined)).toMatch(/418/);
  });
});

describe("isInviteError", () => {
  it("узнаёт оба текста сервера про код", () => {
    expect(isInviteError("Введите инвайт-код")).toBe(true);
    expect(isInviteError("Код недействителен или все места по нему заняты")).toBe(true);
    expect(isInviteError("Этот email уже зарегистрирован")).toBe(false);
  });
});
