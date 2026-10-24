import { describe, it, expect } from "vitest";
import { pickAiConfig, openaiChatUrl, validateAiBaseUrl, checkProviderHost, type AiEnvConfig, type AiSettingsConfig, type AiUserConfig } from "./ai-key";

const ENV: AiEnvConfig = { key: "env-key", baseUrl: "https://env.example.com/v1", model: "env-model" };
const ADMIN: AiSettingsConfig = { aiApiKey: "admin-key", aiBaseUrl: "https://admin.example.com/v1", aiModel: "admin-model" };
const USER_FULL: AiUserConfig = { aiApiKey: "user-key", aiBaseUrl: "https://user.example.com/v1", aiModel: "user-model" };

describe("pickAiConfig — приоритет конфига", () => {
  it("без всего — none", () => {
    const r = pickAiConfig({ key: null, baseUrl: null, model: null }, null, null);
    expect(r).toMatchObject({ key: null, source: "none" });
  });

  it("env работает без настроек админа", () => {
    const r = pickAiConfig(ENV, null, null);
    expect(r).toMatchObject({ key: "env-key", baseUrl: "https://env.example.com/v1", model: "env-model", source: "env" });
  });

  it("админ перекрывает env (ключ, адрес и модель независимо)", () => {
    const r = pickAiConfig(ENV, { aiApiKey: "admin-key", aiBaseUrl: null, aiModel: null }, null);
    expect(r).toMatchObject({ key: "admin-key", source: "admin", baseUrl: "https://env.example.com/v1", model: "env-model" });
  });

  it("только ключ юзера — ключ его, адрес и модель общие (прежнее поведение)", () => {
    const r = pickAiConfig(ENV, ADMIN, { aiApiKey: "user-key", aiBaseUrl: null, aiModel: null });
    expect(r).toMatchObject({
      key: "user-key",
      source: "user",
      baseUrl: "https://admin.example.com/v1",
      model: "admin-model",
    });
  });

  it("общего ключа нет: ключ юзера не наследует адрес и модель из настроек, идёт на провайдера по умолчанию", () => {
    const adminBaseOnly: AiSettingsConfig = { aiApiKey: null, aiBaseUrl: "https://admin.example.com/v1", aiModel: "admin-model" };
    const envBaseOnly: AiEnvConfig = { key: null, baseUrl: "https://env.example.com/v1", model: "env-model" };
    const r = pickAiConfig(envBaseOnly, adminBaseOnly, { aiApiKey: "user-key", aiBaseUrl: null, aiModel: null });
    expect(r).toMatchObject({ key: "user-key", source: "user", baseUrl: null, userBaseUrl: false });
    expect(r.model).not.toBe("admin-model");
    expect(r.model).not.toBe("env-model");
    // своя модель сохраняется
    expect(pickAiConfig(envBaseOnly, adminBaseOnly, { aiApiKey: "user-key", aiBaseUrl: null, aiModel: "my-model" }).model).toBe("my-model");
  });

  it("общий ключ из env тоже считается общим: адрес и модель наследуются", () => {
    const r = pickAiConfig(ENV, null, { aiApiKey: "user-key", aiBaseUrl: null, aiModel: null });
    expect(r).toMatchObject({ baseUrl: "https://env.example.com/v1", model: "env-model" });
  });

  it("полный BYOK: свой ключ + свой адрес + своя модель", () => {
    const r = pickAiConfig(ENV, ADMIN, USER_FULL);
    expect(r).toMatchObject({
      key: "user-key",
      source: "user",
      baseUrl: "https://user.example.com/v1",
      model: "user-model",
    });
  });

  it("userBaseUrl: true только когда адрес задал сам юзер (SSRF-проверка нужна лишь ему)", () => {
    expect(pickAiConfig(ENV, ADMIN, USER_FULL).userBaseUrl).toBe(true);
    // свой ключ, но адрес общий — админский адрес доверенный
    expect(pickAiConfig(ENV, ADMIN, { aiApiKey: "user-key", aiBaseUrl: null, aiModel: null }).userBaseUrl).toBe(false);
    // адрес без своего ключа игнорируется резолвом
    expect(pickAiConfig(ENV, ADMIN, { aiApiKey: null, aiBaseUrl: "https://sneaky.example.com/v1", aiModel: null }).userBaseUrl).toBe(false);
    expect(pickAiConfig(ENV, null, null).userBaseUrl).toBe(false);
  });

  it("свой адрес без модели — нейтральный дефолт вместо чужой модели", () => {
    const r = pickAiConfig(ENV, ADMIN, { aiApiKey: "user-key", aiBaseUrl: "https://user.example.com/v1", aiModel: null });
    expect(r.model).not.toBe("admin-model");
    expect(r.baseUrl).toBe("https://user.example.com/v1");
  });
});

describe("pickAiConfig — инвариант безопасности BYOK", () => {
  it("юзерский адрес получает ТОЛЬКО юзерский ключ, при любых комбинациях", () => {
    const envs: AiEnvConfig[] = [
      ENV,
      { key: null, baseUrl: "https://env.example.com/v1", model: null },
    ];
    const admins: (AiSettingsConfig | null)[] = [null, ADMIN, { aiApiKey: null, aiBaseUrl: "https://admin-b.example.com/v1", aiModel: null }];
    const users: (AiUserConfig | null)[] = [
      null,
      { aiApiKey: null, aiBaseUrl: "https://sneaky.example.com/v1", aiModel: null },
      { aiApiKey: "user-key", aiBaseUrl: "https://user.example.com/v1", aiModel: null },
    ];
    for (const env of envs) {
      for (const admin of admins) {
        for (const user of users) {
          const r = pickAiConfig(env, admin, user);
          const userBaseIsSet = r.baseUrl === "https://user.example.com/v1" || r.baseUrl === "https://sneaky.example.com/v1";
          if (userBaseIsSet) {
            expect(r.source).toBe("user");
            expect(r.key).toBe("user-key");
          }
        }
      }
    }
  });
});

describe("openaiChatUrl", () => {
  it("голый хост получает /v1", () => {
    expect(openaiChatUrl("https://api.deepseek.com")).toBe("https://api.deepseek.com/v1");
  });

  it("полный путь не трогаем, слэш на конце срезаем", () => {
    expect(openaiChatUrl("https://api.z.ai/api/paas/v4/")).toBe("https://api.z.ai/api/paas/v4");
  });

  it("не-URL и не-https — дефолт", () => {
    const fallback = openaiChatUrl(null);
    expect(openaiChatUrl("не url")).toBe(fallback);
    expect(openaiChatUrl("http://evil.example.com")).toBe(fallback);
  });
});

describe("validateAiBaseUrl", () => {
  it("публичный https-адрес проходит", () => {
    expect(validateAiBaseUrl("https://api.deepseek.com/v1")).toEqual({ ok: true, value: "https://api.deepseek.com/v1" });
  });

  it("не-https и не-URL отклоняются", () => {
    expect(validateAiBaseUrl("http://api.example.com/v1").ok).toBe(false);
    expect(validateAiBaseUrl("не url").ok).toBe(false);
  });

  it.each([
    "https://10.0.0.5/v1",
    "https://192.168.1.10/v1",
    "https://169.254.169.254/latest",
    "https://[::1]/v1",
    "https://[::ffff:127.0.0.1]/v1",
    "https://0x0a000005/v1", // шестнадцатеричная запись 10.0.0.5 — URL нормализует её в IP
    "https://db/v1", // docker-сервис
    "https://kong.internal/v1",
  ])("закрытый адрес %s отклоняется для юзера", (url) => {
    expect(validateAiBaseUrl(url).ok).toBe(false);
  });

  it("админу закрытый адрес разрешён (allowPrivateHost) — https по-прежнему обязателен", () => {
    expect(validateAiBaseUrl("https://10.0.0.5/v1", { allowPrivateHost: true }).ok).toBe(true);
    expect(validateAiBaseUrl("http://10.0.0.5/v1", { allowPrivateHost: true }).ok).toBe(false);
  });
});

describe("checkProviderHost", () => {
  it("закрытые адреса отбиваются без запроса в DNS", async () => {
    expect((await checkProviderHost("https://10.0.0.5/v1")).ok).toBe(false);
    expect((await checkProviderHost("https://db/v1")).ok).toBe(false);
  });

  it("публичный IP-литерал проходит", async () => {
    expect((await checkProviderHost("https://8.8.8.8/v1")).ok).toBe(true);
  });

  it("не-URL — отказ", async () => {
    expect((await checkProviderHost("не url")).ok).toBe(false);
  });
});
