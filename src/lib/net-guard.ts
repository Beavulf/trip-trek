import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Защита от SSRF для адресов, которые задаёт пользователь (Base URL ИИ-провайдера,
// endpoint web-push). Сервер ходит по ним сам и изнутри доверенной сети (docker-сеть
// с БД и соседними сервисами), поэтому одного «https» мало — хост должен быть публичным.
//
// Граница: проверка резолва и последующий fetch резолвят имя независимо, так что
// DNS rebinding (ответ меняется между ними) это не закрывает. Закрыть полностью
// можно только пиннингом IP на уровне сокета — для этого нужен свой HTTP-клиент,
// а не fetch/web-push; здесь разумный потолок без него.

export type HostCheck = { ok: true } | { ok: false; error: string };

const OK: HostCheck = { ok: true };

// Суффиксы имён, которые по определению не публичные (локальные зоны, mDNS, корпоративные)
const INTERNAL_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".home.arpa",
  ".corp",
  ".intranet",
  ".localdomain",
];

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

function isPrivateIpv4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    (a === 169 && b === 254) || // link-local + облачные метаданные 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // 192.0.0.0/24, TEST-NET-1
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // бенчмарки 198.18.0.0/15
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

function parseIPv6(raw: string): number[] | null {
  let ip = raw.split("%")[0]; // zone id (fe80::1%eth0) не нужен
  if (ip.includes(".")) {
    // хвост вида ::ffff:1.2.3.4 — превращаем в два шестнадцатеричных блока
    const cut = ip.lastIndexOf(":");
    const v4 = parseIPv4(ip.slice(cut + 1));
    if (!v4) return null;
    ip = `${ip.slice(0, cut + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string) => (s === "" ? [] : s.split(":"));
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
  return nums.length === 8 && nums.every((n) => !Number.isNaN(n)) ? nums : null;
}

function isPrivateIpv6(g: number[]): boolean {
  const v4 = (hi: number, lo: number) => isPrivateIpv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  if (g.slice(0, 6).every((x) => x === 0)) return true; // ::, ::1 и IPv4-совместимые ::a.b.c.d
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4(g[6], g[7]); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4(g[6], g[7]); // NAT64
  if (g[0] === 0x2002) return v4(g[1], g[2]); // 6to4: IPv4 зашит в адрес
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // документация
  if ((g[0] & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link-local, site-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

function bare(host: string): string {
  return host.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

/** true — IP из частных/служебных диапазонов. Не-IP строка тоже считается непубличной (fail closed). */
export function isPrivateIp(ip: string): boolean {
  const h = bare(ip);
  const kind = isIP(h);
  if (kind === 4) return isPrivateIpv4(parseIPv4(h)!);
  if (kind === 6) {
    const groups = parseIPv6(h);
    return groups ? isPrivateIpv6(groups) : true;
  }
  return true;
}

/**
 * Проверка самого имени хоста без DNS: IP-литералы, localhost, внутренние зоны,
 * одно-лейблные имена (docker-сервисы вроде `db`, `kong`) и «числовые» TLD
 * (экзотические записи IPv4 вроде 0x7f.1).
 */
export function checkPublicHostname(hostname: string): HostCheck {
  const h = bare(hostname);
  if (!h) return { ok: false, error: "пустой хост" };
  if (isIP(h)) return isPrivateIp(h) ? { ok: false, error: "адрес из закрытой сети" } : OK;
  if (h === "localhost" || INTERNAL_SUFFIXES.some((s) => h.endsWith(s))) {
    return { ok: false, error: "внутренний адрес" };
  }
  if (!h.includes(".")) return { ok: false, error: "нужно полное доменное имя" };
  if (/^\d+$/.test(h.slice(h.lastIndexOf(".") + 1))) return { ok: false, error: "некорректный адрес" };
  return OK;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Хост публичный И все его DNS-записи ведут на публичные адреса. Закрывает домены
 * вида 127.0.0.1.nip.io и свои A-записи на 10.x. Недоступный DNS — отказ.
 */
export async function checkResolvesToPublic(hostname: string, timeoutMs = 3000): Promise<HostCheck> {
  const literal = checkPublicHostname(hostname);
  if (!literal.ok) return literal;
  const h = bare(hostname);
  if (isIP(h)) return OK; // литерал уже проверен выше

  let addresses: { address: string }[];
  try {
    addresses = await withTimeout(lookup(h, { all: true }), timeoutMs);
  } catch {
    return { ok: false, error: "не удалось определить адрес хоста" };
  }
  if (addresses.length === 0) return { ok: false, error: "не удалось определить адрес хоста" };
  if (addresses.some((a) => isPrivateIp(a.address))) {
    return { ok: false, error: "хост указывает на закрытую сеть" };
  }
  return OK;
}
