// Смоук-тест админки и баг-репортов против dev-сервера.
// Запуск: node scripts/admin-smoke.mjs (или bun)
const BASE = process.env.BASE || "http://localhost:3100";

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/custom-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = r.headers.get("set-cookie") || "";
  const m = setCookie.match(/next-auth\.session-token=([^;]+)/);
  return { ok: r.ok, cookie: m ? `next-auth.session-token=${m[1]}` : "", body: await r.json().catch(() => ({})) };
}

async function api(cookie, method, path, body, isForm = false) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

// 1x1 прозрачный png
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  console.log(`smoke vs ${BASE}`);

  // --- админ: логин с ADMIN_EMAIL должен выдать роль ---
  const admin = await login("you@triptrek.com", "1234");
  check("admin login ok", admin.ok, JSON.stringify(admin.body));
  check("admin got cookie", !!admin.cookie);

  const sess = await api(admin.cookie, "GET", "/api/auth/custom-session");
  check("session isAdmin=true (авто-повышение по ADMIN_EMAIL)", sess.json?.user?.isAdmin === true, JSON.stringify(sess.json));

  // --- не-админ: 403 на все админ-роуты ---
  const leha = await login("leha@triptrek.com", "1234");
  check("leha login ok", leha.ok);
  const lehaSess = await api(leha.cookie, "GET", "/api/auth/custom-session");
  check("session isAdmin=false у обычного юзера", lehaSess.json?.user?.isAdmin === false);
  for (const p of ["/api/admin/stats", "/api/admin/users", "/api/admin/trips", "/api/admin/feedback"]) {
    const r = await api(leha.cookie, "GET", p);
    check(`403 для не-админа: GET ${p}`, r.status === 403, `got ${r.status}`);
  }

  // --- статистика ---
  const stats = await api(admin.cookie, "GET", "/api/admin/stats");
  check("GET /api/admin/stats 200", stats.status === 200);
  check("stats.users число", typeof stats.json?.users === "number");
  check("registrations14d длина 14", stats.json?.registrations14d?.length === 14);

  // --- юзеры ---
  const users = await api(admin.cookie, "GET", "/api/admin/users?q=leha");
  check("поиск юзера по 'leha'", users.status === 200 && (users.json || []).some((u) => u.email?.startsWith("leha")));
  check("в выдаче нет password", JSON.stringify(users.json).includes('"password"') === false);
  const lehaId = (users.json || []).find((u) => u.email?.startsWith("leha"))?.id;

  // premium grant на 1 день
  const grant = await api(admin.cookie, "PATCH", "/api/admin/users", { id: lehaId, plan: "premium", premiumDays: 1 });
  check("выдача premium на 1 день", grant.status === 200 && grant.json?.plan === "premium" && !!grant.json?.planExpiry);
  const lehaSess2 = await api(leha.cookie, "GET", "/api/auth/custom-session");
  check("у leha сессия увидела premium без перелогина", lehaSess2.json?.user?.isPremium === true);
  const revoke = await api(admin.cookie, "PATCH", "/api/admin/users", { id: lehaId, plan: "free" });
  check("снятие premium", revoke.status === 200 && revoke.json?.plan === "free" && revoke.json?.planExpiry === null);

  // смена собственной роли запрещена
  const selfRole = await api(admin.cookie, "PATCH", "/api/admin/users", { id: sess.json.user.id, role: "user" });
  check("смена собственной роли 400", selfRole.status === 400);
  // самоудаление запрещено
  const selfDel = await api(admin.cookie, "DELETE", `/api/admin/users?id=${sess.json.user.id}`);
  check("самоудаление 400", selfDel.status === 400);

  // --- feedback: отправка без и со скриншотом ---
  const fd1 = new FormData();
  fd1.append("message", "Смоук-тест: кнопка Сохранить ничего не делает на странице бюджета");
  fd1.append("type", "bug");
  fd1.append("pageUrl", "/?tab=budget");
  const fb1 = await api(admin.cookie, "POST", "/api/feedback", fd1, true);
  check("POST /api/feedback без файла", fb1.status === 200 && !!fb1.json?.id);

  const fd2 = new FormData();
  fd2.append("message", "Смоук-тест: идея — добавить тёмную тему для карт");
  fd2.append("type", "idea");
  fd2.append("file", new Blob([PNG], { type: "image/png" }), "shot.png");
  const fb2 = await api(leha.cookie, "POST", "/api/feedback", fd2, true);
  check("POST /api/feedback со скриншотом", fb2.status === 200 && !!fb2.json?.id);

  const fbEmpty = await api(admin.cookie, "POST", "/api/feedback", (() => {
    const fd = new FormData();
    fd.append("message", "   ");
    return fd;
  })(), true);
  check("пустое сообщение 400", fbEmpty.status === 400);

  const fbBadType = await api(admin.cookie, "POST", "/api/feedback", (() => {
    const fd = new FormData();
    fd.append("message", "x");
    fd.append("type", "spam");
    return fd;
  })(), true);
  check("неизвестный type приводится к bug (200)", fbBadType.status === 200);

  // --- очередь отзывов ---
  const list = await api(admin.cookie, "GET", "/api/admin/feedback?status=new");
  check("GET /api/admin/feedback?status=new", list.status === 200 && (list.json || []).length >= 2);
  const fbId = (list.json || []).find((f) => f.message?.includes("Смоук-тест: идея"))?.id;
  check("скриншот сохранился (screenshotUrl)", !!(list.json || []).find((f) => f.id === fbId)?.screenshotUrl);

  // скриншот реально отдаётся по /uploads/feedback/
  const shotUrl = (list.json || []).find((f) => f.id === fbId)?.screenshotUrl;
  if (shotUrl) {
    const imgR = await fetch(`${BASE}${shotUrl}`);
    check("скриншот доступен по URL (jpeg)", imgR.status === 200 && imgR.headers.get("content-type")?.includes("jpeg"));
  }

  const patched = await api(admin.cookie, "PATCH", "/api/admin/feedback", { id: fbId, status: "in_progress", adminNote: "взято в работу" });
  check("PATCH статуса и заметки", patched.status === 200 && patched.json?.status === "in_progress" && patched.json?.adminNote === "взято в работу");
  const resolved = await api(admin.cookie, "PATCH", "/api/admin/feedback", { id: fbId, status: "resolved" });
  check("resolved ставит resolvedAt", resolved.status === 200 && !!resolved.json?.resolvedAt);
  const badStatus = await api(admin.cookie, "PATCH", "/api/admin/feedback", { id: fbId, status: "done" });
  check("невалидный статус 400", badStatus.status === 400);

  // --- поездки ---
  const trips = await api(admin.cookie, "GET", "/api/admin/trips");
  check("GET /api/admin/trips", trips.status === 200 && Array.isArray(trips.json));

  // --- удаление отзывов (только созданные тестом) ---
  for (const f of list.json || []) {
    if (!f.message?.includes("Смоук-тест")) continue;
    const del = await api(admin.cookie, "DELETE", `/api/admin/feedback?id=${f.id}`);
    check(`DELETE отзыва ${f.id.slice(-4)}`, del.status === 200);
  }
  const listAfter = await api(admin.cookie, "GET", "/api/admin/feedback");
  check("тестовые отзывы удалены", !(listAfter.json || []).some((f) => f.message?.includes("Смоук-тест")));

  console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : `\nПРОВАЛОВ: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
