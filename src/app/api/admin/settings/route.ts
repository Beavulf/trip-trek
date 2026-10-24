import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-auth";
import { logAdmin } from "@/lib/admin-log";
import { normalizeDonationUrl, normalizeWmzPurse } from "@/lib/support";
import { maskKey, validateAiBaseUrl } from "@/lib/ai-key";
import { getAppConfig } from "@/lib/app-config";

// GET /api/admin/settings — глобальные настройки. Ключ наружу не отдаётся,
// только замаскированный хвост; base URL, модель и конфиг приложения — не секреты
export async function GET(req: NextRequest) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const [settings, appConfig] = await Promise.all([
    db.appSettings.findUnique({
      where: { id: "app" },
      select: { aiApiKey: true, aiBaseUrl: true, aiModel: true, selfUpgradeEnabled: true, demoTripToken: true, contactTelegram: true, donationAlertsUrl: true, webmoneyPurse: true },
    }),
    getAppConfig(),
  ]);

  return NextResponse.json({
    aiKeyTail: settings?.aiApiKey ? maskKey(settings.aiApiKey) : null,
    aiBaseUrl: settings?.aiBaseUrl ?? "",
    aiModel: settings?.aiModel ?? "",
    selfUpgradeEnabled: settings?.selfUpgradeEnabled ?? false,
    demoTripToken: settings?.demoTripToken ?? "",
    contactTelegram: settings?.contactTelegram ?? "",
    donationAlertsUrl: settings?.donationAlertsUrl ?? "",
    webmoneyPurse: settings?.webmoneyPurse ?? "",
    appConfig,
  });
}

// PUT /api/admin/settings — два независимых блока:
//   ИИ:      { aiApiKey: "sk-..." | null, aiBaseUrl, aiModel }
//   Прилож.: { appConfig: { registrationEnabled?, inviteRequired?, freeTripLimit?,
//              freeMemberLimit? }, demoTripToken?, contactTelegram?, donationAlertsUrl?, webmoneyPurse? }
export async function PUT(req: NextRequest) {
  const { user: admin, response } = await requireAdmin(req);
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const { aiApiKey, aiBaseUrl, aiModel, selfUpgradeEnabled, appConfig } = body as {
    aiApiKey?: string | null;
    aiBaseUrl?: string | null;
    aiModel?: string | null;
    selfUpgradeEnabled?: boolean;
    appConfig?: {
      registrationEnabled?: boolean;
      inviteRequired?: boolean;
      freeTripLimit?: number;
      freeMemberLimit?: number;
      aiAlertCallsPerDay?: number;
      aiAlertTokensPerDay?: number;
    };
  };

  const data: {
    aiApiKey?: string | null;
    aiBaseUrl?: string | null;
    aiModel?: string | null;
    selfUpgradeEnabled?: boolean;
    registrationEnabled?: boolean;
    inviteRequired?: boolean;
    freeTripLimit?: number;
    freeMemberLimit?: number;
    aiAlertCallsPerDay?: number;
    aiAlertTokensPerDay?: number;
    demoTripToken?: string | null;
    contactTelegram?: string | null;
    donationAlertsUrl?: string | null;
    webmoneyPurse?: string | null;
  } = {};

  let aiTouched = false;
  if (aiApiKey === null) {
    data.aiApiKey = null;
    aiTouched = true;
  } else if (typeof aiApiKey === "string" && aiApiKey.trim()) {
    data.aiApiKey = aiApiKey.trim();
    aiTouched = true;
  }
  if (aiBaseUrl !== undefined) {
    // https-only: на этот адрес уходят Bearer-ключи пользователей — произвольный
    // scheme/host делал из сервера прокси утечки ключей (аудит 2026-09-12).
    // Валидация одна с профилем юзера (validateAiBaseUrl); localhost — только dev.
    if (typeof aiBaseUrl === "string" && aiBaseUrl.trim()) {
      // allowPrivateHost: адрес задаёт админ, а не пользователь — SSRF-ограничение юзерского пути не нужно
      const checked = validateAiBaseUrl(aiBaseUrl.trim(), { allowPrivateHost: true });
      if (!checked.ok) {
        return NextResponse.json({ error: `aiBaseUrl: ${checked.error}` }, { status: 400 });
      }
      data.aiBaseUrl = checked.value;
    } else {
      data.aiBaseUrl = null;
    }
    aiTouched = true;
  }
  if (aiModel !== undefined) {
    data.aiModel = typeof aiModel === "string" && aiModel.trim() ? aiModel.trim() : null;
    aiTouched = true;
  }
  if (selfUpgradeEnabled !== undefined) {
    if (typeof selfUpgradeEnabled !== "boolean") {
      return NextResponse.json({ error: "selfUpgradeEnabled: boolean" }, { status: 400 });
    }
    data.selfUpgradeEnabled = selfUpgradeEnabled;
    aiTouched = true; // попадает в тот же лог settings.ai — это тоже настройка ИИ-демо
  }

  let appTouched = false;
  if (appConfig && typeof appConfig === "object") {
    if (appConfig.registrationEnabled !== undefined) {
      if (typeof appConfig.registrationEnabled !== "boolean") {
        return NextResponse.json({ error: "registrationEnabled: boolean" }, { status: 400 });
      }
      data.registrationEnabled = appConfig.registrationEnabled;
      appTouched = true;
    }
    if (appConfig.inviteRequired !== undefined) {
      if (typeof appConfig.inviteRequired !== "boolean") {
        return NextResponse.json({ error: "inviteRequired: boolean" }, { status: 400 });
      }
      data.inviteRequired = appConfig.inviteRequired;
      appTouched = true;
    }
    for (const key of ["freeTripLimit", "freeMemberLimit", "aiAlertCallsPerDay", "aiAlertTokensPerDay"] as const) {
      const v = appConfig[key];
      if (v !== undefined) {
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 1_000_000) {
          return NextResponse.json({ error: `${key}: целое число 0–1000000` }, { status: 400 });
        }
        if (key === "freeMemberLimit" && v < 1) {
          return NextResponse.json({ error: "freeMemberLimit: минимум 1" }, { status: 400 });
        }
        data[key] = v;
        appTouched = true;
      }
    }
  }

  // Витрина лендинга: не «правила приложения», поэтому не в appConfig, но лог тот же
  for (const field of ["demoTripToken", "contactTelegram"] as const) {
    const v = (body as Record<string, unknown>)[field];
    if (v !== undefined) {
      if (v !== null && typeof v !== "string") {
        return NextResponse.json({ error: `${field}: строка или null` }, { status: 400 });
      }
      const trimmed = typeof v === "string" ? v.trim().slice(0, 200) : "";
      data[field] = trimmed || null;
      appTouched = true;
    }
  }

  // Поддержка проекта: реквизиты проверяем строго — они показываются всем пользователям внизу профиля
  {
    const body_ = body as Record<string, unknown>;
    const url = body_.donationAlertsUrl;
    if (url !== undefined) {
      if (url !== null && typeof url !== "string") {
        return NextResponse.json({ error: "donationAlertsUrl: строка или null" }, { status: 400 });
      }
      const trimmed = typeof url === "string" ? url.trim() : "";
      if (trimmed && !normalizeDonationUrl(trimmed)) {
        return NextResponse.json({ error: "donationAlertsUrl: нужна ссылка вида https://…" }, { status: 400 });
      }
      data.donationAlertsUrl = trimmed ? normalizeDonationUrl(trimmed) : null;
      appTouched = true;
    }
    const purse = body_.webmoneyPurse;
    if (purse !== undefined) {
      if (purse !== null && typeof purse !== "string") {
        return NextResponse.json({ error: "webmoneyPurse: строка или null" }, { status: 400 });
      }
      const trimmed = typeof purse === "string" ? purse.trim() : "";
      if (trimmed && !normalizeWmzPurse(trimmed)) {
        return NextResponse.json({ error: "webmoneyPurse: кошелёк WMZ — буква Z и 12 цифр" }, { status: 400 });
      }
      data.webmoneyPurse = trimmed ? normalizeWmzPurse(trimmed) : null;
      appTouched = true;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "ничего не передано" }, { status: 400 });
  }

  const settings = await db.appSettings.upsert({
    where: { id: "app" },
    update: data,
    create: { id: "app", ...data },
  });

  // Журнал: секреты (ключ) не пишем — только факт изменения
  if (aiTouched) {
    await logAdmin(admin!.id, "settings.ai", { type: "settings", label: "ИИ" }, {
      keySet: Boolean(settings.aiApiKey),
      baseUrl: settings.aiBaseUrl,
      model: settings.aiModel,
    });
  }
  if (appTouched) {
    await logAdmin(admin!.id, "settings.app", { type: "settings", label: "Приложение" }, {
      registrationEnabled: settings.registrationEnabled,
      inviteRequired: settings.inviteRequired,
      freeTripLimit: settings.freeTripLimit,
      freeMemberLimit: settings.freeMemberLimit,
      aiAlertCallsPerDay: settings.aiAlertCallsPerDay,
      aiAlertTokensPerDay: settings.aiAlertTokensPerDay,
    });
  }

  return NextResponse.json({
    ok: true,
    aiKeyTail: settings.aiApiKey ? maskKey(settings.aiApiKey) : null,
    aiBaseUrl: settings.aiBaseUrl ?? "",
    aiModel: settings.aiModel ?? "",
    appConfig: {
      registrationEnabled: settings.registrationEnabled ?? true,
      freeTripLimit: settings.freeTripLimit ?? 1,
      freeMemberLimit: settings.freeMemberLimit ?? 5,
      aiAlertCallsPerDay: settings.aiAlertCallsPerDay ?? 0,
      aiAlertTokensPerDay: settings.aiAlertTokensPerDay ?? 0,
    },
  });
}
