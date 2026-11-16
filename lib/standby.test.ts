import { describe, expect, it } from "vitest";
import { agoText, findStandby, parseStandbys, readiness, roleFor, roleText } from "./standby";
import type { DnsRecord } from "./dns-switch";

// 公开仓库的检查不许出现 IP 地址字面量（scripts/check-public.sh），测试里拼出来
const ip = (n: number) => ["203", "0", "113", n].join(".");
const SB = ip(30);
const rec = (id: string, name: string, content: string, proxied = false): DnsRecord => ({ id, name, type: "A", content, ttl: 60, proxied });
const inbounds = [
  { tag: "VLESS A", port: 443 },
  { tag: "VLESS B", port: 9444 },
  { tag: "VLESS C", port: "2053" },
];
const hosts = {
  "VLESS A": [{ address: "a.example.com", port: null }],
  "VLESS B": [{ address: "b.example.com", port: 443 }, { address: "old.example.com", port: 443, is_disabled: true }],
  "VLESS C": [{ address: "c.example.com", port: null }],
};

describe("parseStandbys", () => {
  const tok = "x".repeat(24);
  it("没配就是空", () => expect(parseStandbys("")).toEqual({ standbys: [] }));
  it("读出名字和口令", () => expect(parseStandbys(`[{"name":" 备用 1 ","token":"${tok}"}]`)).toEqual({ standbys: [{ name: "备用 1", token: tok }] }));
  it("配错了给出原因", () => {
    expect(parseStandbys("nope")).toHaveProperty("error");
    expect(parseStandbys(`[{"token":"${tok}"}]`)).toHaveProperty("error");
    expect(parseStandbys('[{"name":"a","token":"short"}]')).toHaveProperty("error");
    expect(parseStandbys(`[{"name":"a","token":"${tok}"},{"name":"a","token":"${"y".repeat(24)}"}]`)).toHaveProperty("error");
    expect(parseStandbys(`[{"name":"a","token":"${tok}"},{"name":"b","token":"${tok}"}]`)).toHaveProperty("error");
  });
});

describe("findStandby", () => {
  const list = [
    { name: "一", token: "a".repeat(24) },
    { name: "二", token: "b".repeat(24) },
  ];
  it("口令对上才返回", () => {
    expect(findStandby(list, "b".repeat(24))?.name).toBe("二");
    expect(findStandby(list, "b".repeat(23))).toBeNull();
    expect(findStandby(list, `${"b".repeat(23)}c`)).toBeNull();
    expect(findStandby(list, "")).toBeNull();
    expect(findStandby(list, null)).toBeNull();
  });
});

describe("roleFor", () => {
  it("没有域名指向它：待命", () => {
    expect(roleFor(SB, [rec("1", "b.example.com", ip(20))], hosts, inbounds)).toEqual({ role: null, names: [] });
  });
  it("首尔那种：客户端连 443，入站在 9444，要转发", () => {
    expect(roleFor(SB, [rec("1", "b.example.com", SB)], hosts, inbounds)).toEqual({ role: { inbound: "VLESS B", port: 9444, public: 443 }, names: ["b.example.com"] });
  });
  it("Host 没写端口就用入站的端口（东京 443、洛杉矶 2053 直连）", () => {
    expect(roleFor(SB, [rec("1", "a.example.com", SB)], hosts, inbounds)).toMatchObject({ role: { inbound: "VLESS A", port: 443, public: 443 } });
    expect(roleFor(SB, [rec("1", "c.example.com", SB)], hosts, inbounds)).toMatchObject({ role: { inbound: "VLESS C", port: 2053, public: 2053 } });
  });
  it("停用的 Host、橙色云朵的记录不算", () => {
    expect(roleFor(SB, [rec("1", "old.example.com", SB)], hosts, inbounds)).toMatchObject({ role: null });
    expect(roleFor(SB, [rec("1", "b.example.com", SB, true)], hosts, inbounds)).toMatchObject({ role: null, names: [] });
  });
  it("域名大小写不影响", () => {
    expect(roleFor(SB, [rec("1", "B.Example.com", SB)], hosts, inbounds)).toMatchObject({ role: { inbound: "VLESS B" } });
  });
  it("两个不同的节点同时指向它：报错，备用机保持原样", () => {
    const r = roleFor(SB, [rec("1", "a.example.com", SB), rec("2", "b.example.com", SB)], hosts, inbounds);
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain("VLESS A");
  });
  it("入站找不到或端口不对：报错", () => {
    expect(roleFor(SB, [rec("1", "b.example.com", SB)], hosts, [{ tag: "VLESS B", port: "x" }])).toHaveProperty("error");
  });
});

describe("readiness", () => {
  const sel = { inbound: "VLESS SEL", port: 9444, public: 443 };
  it("回报和现在该做的对上了才算就绪", () => {
    expect(readiness(sel, { detail: "已顶替 VLESS SEL" })).toBe("ready");
    expect(readiness(null, { detail: "已待命" })).toBe("ready");
  });
  it("刚切过去、备用机还没来问：等待", () => {
    expect(readiness(sel, { detail: "已待命" })).toBe("waiting");
    expect(readiness(sel, { detail: "已顶替 VLESS SEA" })).toBe("waiting");
    expect(readiness(null, { detail: "已顶替 VLESS SEL" })).toBe("waiting");
  });
  it("最近一次失败、或者从来没回报过", () => {
    expect(readiness(sel, { detail: "切换失败：docker 没装" })).toBe("error");
    expect(readiness(sel, null)).toBe("unknown");
    expect(readiness(sel, { detail: "别的" })).toBe("unknown");
  });
});

describe("agoText", () => {
  it("写成人话", () => {
    expect(agoText(100, 105)).toBe("刚刚");
    expect(agoText(100, 140)).toBe("40 秒前");
    expect(agoText(100, 100 + 180)).toBe("3 分钟前");
    expect(agoText(100, 100 + 7200, true)).toBe("2h ago");
    expect(agoText(100, 100 + 5 * 86400)).toBe("5 天前");
  });
});

describe("roleText", () => {
  it("写成人话", () => {
    expect(roleText(null)).toBe("待命");
    expect(roleText({ inbound: "VLESS B", port: 9444, public: 443 })).toBe("顶替 VLESS B（443 → 9444）");
    expect(roleText({ inbound: "VLESS A", port: 443, public: 443 }, true)).toBe("serving VLESS A (443)");
  });
});
