import { describe, it, expect } from "vitest";
import { pickAiConfig, openaiChatUrl, type AiEnvConfig, type AiSettingsConfig, type AiUserConfig } from "./ai-key";

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

  it("полный BYOK: свой ключ + свой адрес + своя модель", () => {
    const r = pickAiConfig(ENV, ADMIN, USER_FULL);
    expect(r).toMatchObject({
      key: "user-key",
      source: "user",
      baseUrl: "https://user.example.com/v1",
      model: "user-model",
    });
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
