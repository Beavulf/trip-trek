import { describe, expect, it } from "vitest";
import { checkPublicHostname, checkResolvesToPublic, isPrivateIp } from "./net-guard";

describe("isPrivateIp — IPv4", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "127.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
  ])("%s — закрытый", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.0.1", "93.184.216.34"])(
    "%s — публичный",
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    }
  );
});

describe("isPrivateIp — IPv6", () => {
  it.each([
    "::",
    "::1",
    "[::1]",
    "fe80::1",
    "fe80::1%eth0",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1", // NAT64 → 10.0.0.1
    "2002:7f00:1::1", // 6to4 → 127.0.0.1
    "2001:db8::1",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2", // Teredo
  ])("%s — закрытый", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["2606:4700:4700::1111", "2a00:1450:4001::200e", "::ffff:8.8.8.8"])("%s — публичный", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });

  it("мусор вместо IP — закрытый (fail closed)", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("")).toBe(true);
  });
});

describe("checkPublicHostname", () => {
  it.each([
    "localhost",
    "LOCALHOST.",
    "foo.localhost",
    "printer.local",
    "db.internal",
    "nas.lan",
    "db", // docker-сервис
    "kong",
    "127.0.0.1",
    "[::1]",
    "169.254.169.254",
    "0x7f.1", // экзотическая запись IPv4
    "1.2.3.4.5",
    "",
  ])("%j — отказ", (host) => {
    expect(checkPublicHostname(host).ok).toBe(false);
  });

  it.each(["api.openai.com", "api.deepseek.com", "fcm.googleapis.com", "8.8.8.8", "[2606:4700:4700::1111]"])(
    "%s — ок",
    (host) => {
      expect(checkPublicHostname(host).ok).toBe(true);
    }
  );
});

describe("checkResolvesToPublic (без сети: только литералы и отказы до DNS)", () => {
  it("публичный IP-литерал проходит без запроса в DNS", async () => {
    expect((await checkResolvesToPublic("8.8.8.8")).ok).toBe(true);
  });

  it("закрытые имена отбиваются до DNS", async () => {
    expect((await checkResolvesToPublic("localhost")).ok).toBe(false);
    expect((await checkResolvesToPublic("10.0.0.5")).ok).toBe(false);
    expect((await checkResolvesToPublic("db")).ok).toBe(false);
  });
});
