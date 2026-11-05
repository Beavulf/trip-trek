import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyUser } from "@/lib/notify";
import { fetchJson } from "@/lib/outbound";
import { refreshDonationAlertsToken } from "@/lib/donationalerts-oauth";
import {
  formatDonationLine,
  matchDonationToUser,
  parseDonationEvent,
  type ParsedDonation,
} from "./donations";

// Серверная часть донатов (ADR-0011): постоянный WS-клиент к DonationAlerts (Centrifugo),
// живёт в процессе сервера рядом с остальными джобами. Запускается из server.ts после listen.
//
// Протокол DA: OAuth-токен (oauth-user-show + oauth-donation-subscribe) →
// GET /api/v1/user/oauth → socket_connection_token → WS wss://centrifugo.donationalerts.com/
// connection/websocket c фреймом {"params":{token},"id":1} → получаем client →
// POST /api/v1/centrifuge/subscribe {client, channels} → токен подписки →
// {"id":2,"method":1,"params":{channel, token}} → пушы донатов на канал $alerts:donation_<daId>.
//
// Осторожность: uncaughtException в server.ts убивает процесс — НИКАКИЙ код здесь не бросает
// наружу; каждый колбэк под своим try/catch, ошибки — в logger и статус для админки.

const DA_API = "https://www.donationalerts.com/api/v1";
const DA_WS_URL = "wss://centrifugo.donationalerts.com/connection/websocket";

const NO_TOKEN_WAIT_MS = 5 * 60 * 1000; // токена нет — это не ошибка, ждём спокойно
const RECONNECT_MIN_MS = 5 * 1000;
const RECONNECT_MAX_MS = 60 * 1000;
const SUBSCRIBE_TIMEOUT_MS = 15 * 1000; // сколько ждём подписку после коннекта
const SILENCE_RECONNECT_MS = 2 * 60 * 1000; // тише этого — рвём и переподключаемся (самолечение)
const HEALTH_PING_MS = 30 * 1000;

export interface DonationClientStatus {
  state: "off" | "connecting" | "connected" | "error";
  /** Название аккаунта DA, когда токен проверен */
  daAccount?: string;
  lastEventAt?: string;
  lastError?: string;
}

const status: DonationClientStatus = { state: "off" };
let started = false;
let ws: WebSocket | null = null;
let wakeLoop: (() => void) | null = null;

export function getDonationClientStatus(): DonationClientStatus {
  return { ...status };
}

function setStatus(patch: Partial<DonationClientStatus>): void {
  Object.assign(status, patch);
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wakeLoop = null;
      resolve();
    }, ms);
    wakeLoop = () => {
      clearTimeout(timer);
      wakeLoop = null;
      resolve();
    };
  });

async function readToken(): Promise<string | null> {
  const row = await db.appSettings.findUnique({
    where: { id: "app" },
    select: {
      donationAlertsToken: true,
      donationAlertsRefreshToken: true,
      donationAlertsTokenExpiresAt: true,
      donationAlertsClientId: true,
      donationAlertsClientSecret: true,
    },
  });
  if (!row?.donationAlertsToken) return null;
  const token = row.donationAlertsToken.trim();
  if (!token) return null;

  if (
    !row.donationAlertsTokenExpiresAt ||
    row.donationAlertsTokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return token;
  }
  if (!row.donationAlertsRefreshToken || !row.donationAlertsClientId || !row.donationAlertsClientSecret) {
    logger.error("donations: OAuth token expired without refresh credentials");
    return token;
  }

  try {
    const refreshed = await refreshDonationAlertsToken({
      clientId: row.donationAlertsClientId,
      clientSecret: row.donationAlertsClientSecret,
      refreshToken: row.donationAlertsRefreshToken,
    });
    await db.appSettings.update({
      where: { id: "app" },
      data: {
        donationAlertsToken: refreshed.accessToken,
        donationAlertsRefreshToken: refreshed.refreshToken ?? row.donationAlertsRefreshToken,
        donationAlertsTokenExpiresAt: refreshed.expiresAt,
      },
    });
    logger.info("donations: OAuth access token refreshed");
    return refreshed.accessToken;
  } catch (error) {
    logger.error("donations: OAuth access token refresh failed", { error: String(error) });
    return token;
  }
}

export async function getDonationAccessToken(): Promise<string | null> {
  return readToken();
}

export function refreshDonationAlertsConnection(): void {
  wakeLoop?.();
  ws?.close();
}

/** Проверка токена через DA: используется и кнопкой «Проверить связь» в админке. */
export async function checkDonationToken(
  token: string,
): Promise<{ ok: true; account: string } | { ok: false; error: string }> {
  const r = await fetchJson<{ data?: { id?: number; name?: string } }>(`${DA_API}/user/oauth`, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 10_000,
    retries: 0, // 401/403 ретраить бессмысленно
  });
  const id = r?.data?.id;
  if (!r?.data || !id) {
    return { ok: false, error: r === null ? "DonationAlerts недоступен" : "токен отклонён (401/403?)" };
  }
  return { ok: true, account: r.data.name ? `${r.data.name} (#${id})` : `#${id}` };
}

/** Одна попытка соединения: резолвится, когда соединение завершилось (close/error/таймаут подписки). */
function connectOnce(oauthToken: string, daUserId: number, socketToken: string): Promise<void> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    let settled = false;
    let lastMessageAt = Date.now();
    let nextId = 10; // наши запросы с 10: id 1/2 — протокольные, чужие id можем отвечать ping'ом

    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(health);
      try {
        socket?.close();
      } catch {
        /* уже закрыт */
      }
      ws = null;
      resolve();
    };

    try {
      socket = new WebSocket(DA_WS_URL);
    } catch (e) {
      logger.error("donations: ws constructor failed", { error: String(e) });
      resolve();
      return;
    }
    ws = socket;

    // Самолечение: если сервер молчит (протокольный ping не понял/завис) — рвём сами,
    // цикл переподключится. .unref() — таймер не держит процесс на shutdown.
    const health = setInterval(() => {
      if (!settled && Date.now() - lastMessageAt > SILENCE_RECONNECT_MS) finish();
    }, HEALTH_PING_MS).unref();

    socket.onopen = () => {
      try {
        socket.send(JSON.stringify({ params: { token: socketToken }, id: 1 }));
      } catch (e) {
        logger.error("donations: failed to send connect", { error: String(e) });
        finish();
      }
    };

    socket.onmessage = (ev: MessageEvent) => {
      lastMessageAt = Date.now();
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
      } catch {
        return; // не JSON — игнор
      }
      try {
        void handleMessage(msg, socket, oauthToken, daUserId, () => settled, finish);
      } catch (e) {
        logger.error("donations: message handler crashed", { error: String(e) });
      }
    };

    socket.onerror = () => {
      // детали придут в onclose; здесь только пометка
      setStatus({ state: "error", lastError: "ошибка соединения с Centrifugo" });
    };
    socket.onclose = () => finish();
  });
}

/** Разбор входящего фрейма: ответы на наши запросы (id 1/2), чужие id (ping) и пушы донатов. */
async function handleMessage(
  msg: Record<string, unknown>,
  socket: WebSocket,
  oauthToken: string,
  daUserId: number,
  isSettled: () => boolean,
  finish: () => void,
): Promise<void> {
  const id = typeof msg.id === "number" ? msg.id : null;

  // Пуш доната: без id, данные под result.data.data (формат Centrifugo-реплея)
  if (id === null && msg.result && typeof msg.result === "object") {
    const result = msg.result as { channel?: unknown; data?: { data?: unknown } };
    if (typeof result.channel === "string" && result.data && typeof result.data === "object") {
      const parsed = parseDonationEvent(result.data.data);
      if (!parsed) {
        logger.warn("donations: unparsable push", { channel: result.channel });
        return;
      }
      await ingestDonation(parsed, "donationalerts");
    }
    return;
  }

  // Ответ на connect (id 1): в result.client — наш идентификатор для запроса токена подписки
  if (id === 1) {
    if (msg.error) {
      logger.error("donations: connect rejected", { error: JSON.stringify(msg.error) });
      setStatus({ state: "error", lastError: "Centrifugo отклонил соединение" });
      finish();
      return;
    }
    const client = (msg.result as { client?: unknown } | null)?.client;
    if (typeof client !== "string") {
      finish();
      return;
    }
    const channel = `$alerts:donation_${daUserId}`;
    const subToken = await fetchSubscribeToken(oauthToken, client, channel);
    if (!subToken) {
      setStatus({ state: "error", lastError: "не получили токен подписки у DA" });
      finish();
      return;
    }
    try {
      socket.send(JSON.stringify({ id: 2, method: 1, params: { channel, token: subToken } }));
    } catch (e) {
      logger.error("donations: failed to send subscribe", { error: String(e) });
      finish();
      return;
    }
    // Подписка подтверждается ответом id 2; если тишина — здоровье порвёт соединение
    setTimeout(() => {
      if (!isSettled() && status.state !== "connected") {
        setStatus({ state: "error", lastError: "подписка не подтвердилась" });
        finish();
      }
    }, SUBSCRIBE_TIMEOUT_MS).unref();
    return;
  }

  // Ответ на subscribe (id 2)
  if (id === 2) {
    if (msg.error) {
      logger.error("donations: subscribe rejected", { error: JSON.stringify(msg.error) });
      setStatus({ state: "error", lastError: "подписка отклонена" });
      finish();
      return;
    }
    setStatus({ state: "connected", lastError: undefined });
    logger.info("donations: subscribed", { channel: `$alerts:donation_${daUserId}` });
    return;
  }

  // Прочие id (протокольный ping сервера) — отвечаем, чтобы нас не считали мёртвыми
  if (id !== null && !isSettled()) {
    try {
      socket.send(JSON.stringify({ id, ping: {} }));
    } catch {
      /* соединение уже закрывается */
    }
  }
}

/** Токен приватной подписки: POST /centrifuge/subscribe с client и каналом. */
async function fetchSubscribeToken(
  oauthToken: string,
  client: string,
  channel: string,
): Promise<string | null> {
  const r = await fetchJson<{ channels?: { channel?: string; token?: string }[] }>(
    `${DA_API}/centrifuge/subscribe`,
    {
      method: "POST",
      body: JSON.stringify({ client, channels: [channel] }),
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        "Content-Type": "application/json",
      },
      timeoutMs: 10_000,
      retries: 1,
    },
  );
  return r?.channels?.find((c) => c.channel === channel)?.token ?? null;
}

/**
 * Записать донат и разослать уведомления админам. Дубль по externalId (реплей после
 * реконнекта) тихо пропускается — без повторного колокольчика. Никогда не бросает.
 */
export async function ingestDonation(
  parsed: ParsedDonation,
  source: "donationalerts" | "test",
): Promise<"new" | "duplicate"> {
  try {
    const donation = await db.donation.create({ data: { ...parsed, source } }).catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null; // дубль
      throw e;
    });
    if (!donation) return "duplicate";

    // Автоматч по email: список юзеров небольшой (сотни), грузим целиком — совпадение
    // точное (email @unique). По name не матчим: имя неуникально. Пересмотрим при росте.
    const users = await db.user.findMany({ select: { id: true, email: true } });
    const matchedUserId = matchDonationToUser(parsed, users);
    if (matchedUserId) {
      await db.donation.update({ where: { id: donation.id }, data: { matchedUserId, matchedBy: "auto" } });
    }

    const line = formatDonationLine(parsed);
    const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true } });
    await Promise.allSettled(
      admins.map((a) =>
        notifyUser(a.id, {
          type: "donation",
          title: "❤️ Новый донат",
          body: line,
          url: "/admin/donations",
        }),
      ),
    );
    if (matchedUserId) {
      await notifyUser(matchedUserId, {
        type: "donation",
        title: "❤️ Спасибо за поддержку!",
        body: "Мы увидели ваш донат и отметили его в профиле.",
        url: "/",
      });
    }

    setStatus({ lastEventAt: new Date().toISOString() });
    logger.info("donations: new", {
      externalId: parsed.externalId,
      amountCents: parsed.amountCents,
      currency: parsed.currency,
      source,
      matched: Boolean(matchedUserId),
    });
    return "new";
  } catch (e) {
    logger.error("donations: ingest failed", { externalId: parsed.externalId, error: String(e) });
    setStatus({ state: "error", lastError: "сбой записи доната" });
    return "duplicate"; // не уточняем — при сбое записи тише пропустить, чем уведомить дважды
  }
}

/** Тестовый донат из админки: проходит весь путь, как настоящий, но с source="test". */
export async function simulateDonation(): Promise<"new" | "duplicate"> {
  const n = Date.now();
  return ingestDonation(
    {
      externalId: `test-${n}`,
      donaterName: "Тестовый донатер",
      daUsername: null,
      message: "тест подключения",
      amountCents: 10000,
      currency: "RUB",
      donatedAt: new Date(),
    },
    "test",
  );
}

/** Цикл клиента: токен → соединение → ждём закрытия → бэкофф → заново. Никогда не бросает. */
async function runLoop(): Promise<void> {
  let backoffMs = RECONNECT_MIN_MS;
  for (;;) {
    try {
      const oauthToken = await readToken();
      if (!oauthToken) {
        setStatus({ state: "off", lastError: undefined });
        await sleep(NO_TOKEN_WAIT_MS);
        continue;
      }
      setStatus({ state: "connecting" });
      const me = await checkDonationToken(oauthToken);
      if (!me.ok) {
        setStatus({ state: "error", lastError: me.error, daAccount: undefined });
        logger.error("donations: token check failed", { error: me.error });
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
        continue;
      }
      setStatus({ daAccount: me.account });

      // Загружаем официальный OAuth-профиль с Centrifugo connection token.
      const cur = await fetchJson<{ data?: { id?: number; socket_connection_token?: string } }>(
        `${DA_API}/user/oauth`,
        { headers: { Authorization: `Bearer ${oauthToken}` }, timeoutMs: 10_000, retries: 0 },
      );
      const socketToken = cur?.data?.socket_connection_token;
      const daUserId = cur?.data?.id;
      if (!socketToken || !daUserId) {
        setStatus({ state: "error", lastError: "DA не отдал socket_connection_token (проверьте OAuth scopes)" });
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
        continue;
      }

      await connectOnce(oauthToken, daUserId, socketToken);
      // Была ли живая сессия (успешная подписка) до закрытия: долгую сессию не считаем ошибкой,
      // бэкофф сбрасываем — рвутся стабильные соединения, а не борьба с отказом
      const hadSession = status.state === "connected";
      setStatus({ state: "connecting", lastError: "соединение закрыто, переподключаемся" });
      await sleep(hadSession ? RECONNECT_MIN_MS : backoffMs);
      backoffMs = hadSession ? RECONNECT_MIN_MS : Math.min(backoffMs * 2, RECONNECT_MAX_MS);
      continue;
    } catch (e) {
      logger.error("donations: loop iteration crashed", { error: String(e) });
      setStatus({ state: "error", lastError: String(e).slice(0, 200) });
    }
    await sleep(backoffMs);
    backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
  }
}

/** Запуск из server.ts после listen. Повторный вызов (HMR) игнорирует. */
export function startDonationAlertsClient(): void {
  if (started) return;
  started = true;
  logger.info("donations: client starting");
  void runLoop();
}
