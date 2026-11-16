import { describe, expect, it } from "vitest";
import { parseEvents, parseProbes, probeMail, probeTargets } from "./probe";
import type { DnsRecord } from "./dns-switch";

// 公开仓库的检查不许出现 IP 地址字面量（scripts/check-public.sh），测试里拼出来
const ip = (n: number) => ["203", "0", "113", n].join(".");
const rec = (name: string, content: string, proxied = false): DnsRecord => ({ id: name, name, type: "A", content, ttl: 60, proxied });

describe("parseProbes", () => {
  it("和 STANDBYS 一样的格式", () => {
    expect(parseProbes(`[{"name":"家里-联通","token":"${"a".repeat(24)}"}]`)).toEqual({ probes: [{ name: "家里-联通", token: "a".repeat(24) }] });
    expect(parseProbes("")).toEqual({ probes: [] });
    const bad = parseProbes('[{"name":"x","token":"short"}]');
    expect(bad).toHaveProperty("error");
    expect((bad as { error: string }).error).toContain("PROBES");
  });
});

describe("probeTargets", () => {
  const inbounds = [
    { tag: "A", port: 443 },
    { tag: "B", port: 9444 },
    { tag: "C", port: "2053" },
  ];
  const nodes = [
    { name: "东京", address: ip(10) },
    { name: "首尔", address: ip(20) },
  ];
  it("只测有启用 Host 在用的灰云记录，端口按客户端实际连的算，名字用面板里的节点名", () => {
    const records = [rec("a.example.com", ip(10)), rec("b.example.com", ip(20)), rec("c.example.com", ip(30)), rec("www.example.com", ip(40), true), rec("unused.example.com", ip(50))];
    const hosts = {
      A: [{ address: "a.example.com", port: null }],
      B: [{ address: "b.example.com", port: 443 }],
      C: [{ address: "C.Example.com ", port: null }, { address: "www.example.com", port: null }],
    };
    expect(probeTargets(records, hosts, inbounds, nodes)).toEqual([
      { host: "c.example.com", port: 2053, label: "c.example.com" },
      { host: "a.example.com", port: 443, label: "东京" },
      { host: "b.example.com", port: 443, label: "首尔" },
    ]);
  });
  it("停用的 Host 不测", () => {
    expect(probeTargets([rec("a.example.com", ip(10))], { A: [{ address: "a.example.com", is_disabled: true }] }, inbounds, nodes)).toEqual([]);
  });
});

describe("parseEvents", () => {
  it("没带就是空，格式不对返回 null", () => {
    expect(parseEvents(undefined)).toEqual([]);
    expect(parseEvents("x")).toBeNull();
    expect(parseEvents([{ host: "a b", port: 443, state: "down" }])).toBeNull();
    expect(parseEvents([{ host: "a.example.com", port: 0, state: "down" }])).toBeNull();
    expect(parseEvents([{ host: "a.example.com", port: 443, state: "maybe" }])).toBeNull();
  });
  it("整理成统一的样子", () => {
    expect(parseEvents([{ host: "A.example.com", port: 443, label: " 东京 ", state: "down", since: 100.7, detail: "x" }])).toEqual([
      { host: "a.example.com", port: 443, label: "东京", state: "down", since: 100, detail: "x" },
    ]);
  });
});

describe("probeMail", () => {
  const down = { host: "a.example.com", port: 443, label: "东京", state: "down" as const, since: 1000, detail: "" };
  it("连不上的写进标题，附处理办法和后台链接", () => {
    const m = probeMail("家里-联通", [down], 1000 + 900, "https://admin.example.test")!;
    expect(m.subject).toBe("【疑似被墙】东京（家里-联通）");
    expect(m.text).toContain("15 分钟前开始");
    expect(m.text).toContain("切到备用机");
    expect(m.text).toContain("https://admin.example.test/admin/dns");
  });
  it("只有恢复的：标题是已恢复", () => {
    const m = probeMail("家里-联通", [{ ...down, state: "up" }], 1000 + 3700, null)!;
    expect(m.subject).toBe("【已恢复】东京（家里-联通）");
    expect(m.text).toContain("1 小时 2 分钟");
    expect(m.text).not.toContain("去后台");
  });
  it("没有变化不发", () => expect(probeMail("x", [], 0, null)).toBeNull());
});
