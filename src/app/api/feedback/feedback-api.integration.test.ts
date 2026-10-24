// Интеграционный прогон обратной связи на настоящем Postgres (обработчики роутов напрямую, настоящие JWT-куки).
// Нужна пустая база с миграциями — как для split-api.integration.test.ts (там же команды запуска;
// переменная общая: SPLIT_TEST_DATABASE_URL). Без неё набор пропускается.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const URL_ENV = process.env.SPLIT_TEST_DATABASE_URL;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!URL_ENV)("API обратной связи (Postgres)", () => {
  let db: typeof import("@/lib/db").db;
  const SECRET = randomBytes(32).toString("hex");
  const users: Record<string, { id: string; cookie: string }> = {};

  let submit: typeof import("./route");
  let mine: typeof import("./mine/route");
  let detail: typeof import("./[id]/route");
  let reply: typeof import("./[id]/messages/route");
  let guest: typeof import("./guest/route");
  let adminList: typeof import("../admin/feedback/route");
  let adminDetail: typeof import("../admin/feedback/[id]/route");
  let adminReply: typeof import("../admin/feedback/[id]/messages/route");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_ENV!;
    process.env.NEXTAUTH_SECRET = SECRET;
    ({ db } = await import("@/lib/db"));
    submit = await import("./route");
    mine = await import("./mine/route");
    detail = await import("./[id]/route");
    reply = await import("./[id]/messages/route");
    guest = await import("./guest/route");
    adminList = await import("../admin/feedback/route");
    adminDetail = await import("../admin/feedback/[id]/route");
    adminReply = await import("../admin/feedback/[id]/messages/route");

    for (const [key, role] of [["anna", "user"], ["ben", "user"], ["root", "admin"]] as const) {
      const u = await db.user.create({
        data: { email: `${key}-${Date.now()}@fb.test`, name: key, password: "x", emoji: "🦊", color: "#10b981", role },
      });
      users[key] = {
        id: u.id,
        cookie: `next-auth.session-token=${jwt.sign({ id: u.id, name: key, email: u.email }, SECRET, { algorithm: "HS256" })}`,
      };
    }
  });

  afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id);
    await db.feedback.deleteMany({ where: { OR: [{ userId: { in: ids } }, { userId: null, contactEmail: { endsWith: "@guest.test" } }] } });
    await db.userNotification.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  const call = (path: string, who: string | null, init: { method?: string; body?: unknown; form?: FormData; ip?: string } = {}) =>
    new NextRequest(`http://localhost/api${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(who ? { cookie: users[who].cookie } : {}),
        ...(init.form ? {} : { "content-type": "application/json" }),
        "x-forwarded-for": init.ip ?? "10.0.0.1",
        "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
      },
      body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
    });
  const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
  const json = async (res: Response): Promise<Json> => res.json();
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  };

  let id = "";

  it("обращение: сохраняет тип и контекст, админы получают уведомление, сам автор-админ — нет", async () => {
    const res = await submit.POST(call("/feedback", "anna", { method: "POST", form: form({ message: "  Карта не грузится  ", type: "complaint", screen: "map", viewport: "412x780 pwa", appVersion: "0.2.16" }) }));
    expect(res.status).toBe(200);
    id = (await json(res)).id;
    const row = await db.feedback.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ type: "complaint", message: "Карта не грузится", screen: "map", viewport: "412x780 pwa", appVersion: "0.2.16", status: "new", userId: users.anna.id });
    expect(row.userAgent).toContain("Pixel 8");
    await new Promise((r) => setTimeout(r, 300)); // уведомление уходит fire-and-forget
    const note = await db.userNotification.findFirst({ where: { userId: users.root.id, type: "feedback_new" } });
    expect(note?.url).toBe(`/admin/feedback?open=${id}`);
    expect(note?.title).toContain("жалоба");
  });

  it("noContext=1: устройство и экран не сохраняются; пустое и без входа — отбой", async () => {
    const res = await submit.POST(call("/feedback", "ben", { method: "POST", form: form({ message: "идея", type: "idea", noContext: "1", screen: "budget" }) }));
    const row = await db.feedback.findUniqueOrThrow({ where: { id: (await json(res)).id } });
    expect(row.userAgent).toBeNull();
    expect(row.screen).toBeNull();
    expect((await submit.POST(call("/feedback", "ben", { method: "POST", form: form({ message: "   " }) }))).status).toBe(400);
    expect((await submit.POST(call("/feedback", null, { method: "POST", form: form({ message: "x" }) }))).status).toBe(401);
  });

  it("свои обращения: чужое не видно; открытие помечает прочитанным", async () => {
    expect((await detail.GET(call(`/feedback/${id}`, "ben"), ctx({ id }))).status).toBe(404);
    const list = await json(await mine.GET(call("/feedback/mine", "anna")));
    expect(list.items).toHaveLength(1);
    expect(list.unread).toBe(0);
  });

  it("ответ админа: статус «в работе», уведомление автору со ссылкой, непрочитано до открытия", async () => {
    const res = await adminReply.POST(call(`/admin/feedback/${id}/messages`, "root", { method: "POST", body: { body: "Починили, обновите страницу" } }), ctx({ id }));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ status: "in_progress", emailed: null });
    const note = await db.userNotification.findFirst({ where: { userId: users.anna.id, type: "feedback_reply" } });
    expect(note?.url).toBe(`/?feedback=${id}`);
    // обычный юзер к админским ручкам не допускается
    expect((await adminReply.POST(call(`/admin/feedback/${id}/messages`, "anna", { method: "POST", body: { body: "я админ" } }), ctx({ id }))).status).toBe(403);

    const list = await json(await mine.GET(call("/feedback/mine", "anna")));
    expect(list.unread).toBe(1);
    expect(list.items[0]).toMatchObject({ unread: true, status: "in_progress", messagesCount: 2 });
    expect((await json(await mine.GET(call("/feedback/mine?summary=1", "anna")))).unread).toBe(1);

    const d = await json(await detail.GET(call(`/feedback/${id}`, "anna"), ctx({ id })));
    expect(d.thread.map((m: Json) => m.author)).toEqual(["user", "admin"]);
    expect((await json(await mine.GET(call("/feedback/mine?summary=1", "anna")))).unread).toBe(0);
  });

  it("автор дописывает в закрытое: обращение возвращается в очередь админа", async () => {
    await adminReply.POST(call(`/admin/feedback/${id}/messages`, "root", { method: "POST", body: { body: "Закрываем", status: "resolved" } }), ctx({ id }));
    expect((await db.feedback.findUniqueOrThrow({ where: { id } })).status).toBe("resolved");
    expect((await reply.POST(call(`/feedback/${id}/messages`, "ben", { method: "POST", body: { body: "чужое" } }), ctx({ id }))).status).toBe(404);
    const res = await reply.POST(call(`/feedback/${id}/messages`, "anna", { method: "POST", body: { body: "Не помогло" } }), ctx({ id }));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ status: "new" });
    expect((await db.feedback.findUniqueOrThrow({ where: { id } })).resolvedAt).toBeNull();
    expect((await reply.POST(call(`/feedback/${id}/messages`, "anna", { method: "POST", body: { body: "  " } }), ctx({ id }))).status).toBe(400);
  });

  it("админка: список со статусами, поиск по переписке, карточка с контекстом", async () => {
    const all = await json(await adminList.GET(call("/admin/feedback", "root")));
    expect(all.items.find((i: Json) => i.id === id)).toMatchObject({ status: "new", messagesCount: 4, lastMessage: { author: "user", body: "Не помогло" } });
    const found = await json(await adminList.GET(call("/admin/feedback?q=обновите", "root")));
    expect(found.items.map((i: Json) => i.id)).toContain(id); // нашлось по реплике админа
    const none = await json(await adminList.GET(call("/admin/feedback?q=нетакогослова", "root")));
    expect(none.items).toHaveLength(0);
    const d = await json(await adminDetail.GET(call(`/admin/feedback/${id}`, "root"), ctx({ id })));
    expect(d).toMatchObject({ screen: "map", authorTotal: 1, user: { name: "anna" } });
    expect(d.thread).toHaveLength(4);
    expect((await adminList.GET(call("/admin/feedback", "anna"))).status).toBe(403);
  });

  it("гость: письмо с email попадает в очередь; приманка и мусор отсекаются; лимит по IP", async () => {
    const g = (body: Json, ip = "10.1.1.1") => guest.POST(call("/feedback/guest", null, { method: "POST", body, ip }));
    expect((await g({ message: "Не пришло письмо для сброса", email: "Lost@Guest.test" })).status).toBe(200);
    const row = await db.feedback.findFirstOrThrow({ where: { contactEmail: "lost@guest.test" } });
    expect(row).toMatchObject({ userId: null, type: "question" });
    expect((await g({ message: "x", email: "не-почта" })).status).toBe(400);
    expect((await g({ message: "", email: "a@guest.test" })).status).toBe(400);
    // бот заполнил приманку: «успех», но записи нет
    await g({ message: "спам", email: "bot@guest.test", website: "http://spam" });
    expect(await db.feedback.count({ where: { contactEmail: "bot@guest.test" } })).toBe(0);
    // четвёртое за час с одного адреса — 429
    await g({ message: "второе", email: "b@guest.test" });
    await g({ message: "третье", email: "c@guest.test" });
    expect((await g({ message: "четвёртое", email: "d@guest.test" })).status).toBe(429);
  });

  it("ответ гостю без настроенной почты: сохраняется, emailed=false", async () => {
    const row = await db.feedback.findFirstOrThrow({ where: { contactEmail: "lost@guest.test" } });
    delete process.env.SMTP_HOST;
    const res = await adminReply.POST(call(`/admin/feedback/${row.id}/messages`, "root", { method: "POST", body: { body: "Проверьте спам" } }), ctx({ id: row.id }));
    expect(await json(res)).toMatchObject({ ok: true, emailed: false });
  });

  it("удаление админом: переписка уходит каскадом", async () => {
    const del = await adminList.DELETE(call(`/admin/feedback?id=${id}`, "root", { method: "DELETE" }));
    expect(del.status).toBe(200);
    expect(await db.feedbackMessage.count({ where: { feedbackId: id } })).toBe(0);
  });
});
