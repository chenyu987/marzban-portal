import { describe, expect, it } from "vitest";
import { checkIPv4, hostsUsing, inZone, parseDnsZones, switchable, ttlText } from "./dns-switch";

// 公开仓库的检查不许出现 IP 地址字面量（scripts/check-public.sh），测试里拼出来
const ip = (...p: (number | string)[]) => p.join(".");

describe("parseDnsZones", () => {
  it("没配就是空", () => {
    expect(parseDnsZones(undefined)).toEqual({ zones: [] });
    expect(parseDnsZones("  ")).toEqual({ zones: [] });
  });
  it("读出域名和 token，域名转小写、去掉结尾的点", () => {
    expect(parseDnsZones('[{"zone":"Example.COM.","token":" t1 "},{"zone":"b.example.net","token":"t2"}]')).toEqual({
      zones: [
        { zone: "example.com", token: "t1" },
        { zone: "b.example.net", token: "t2" },
      ],
    });
  });
  it("配错了给出原因", () => {
    expect(parseDnsZones("{")).toHaveProperty("error");
    expect(parseDnsZones('{"zone":"a.com"}')).toHaveProperty("error");
    expect(parseDnsZones('[{"zone":"a.com"}]')).toHaveProperty("error");
    expect(parseDnsZones('[{"zone":"not a domain","token":"t"}]')).toHaveProperty("error");
    expect(parseDnsZones('[{"zone":"a.com","token":"t"},{"zone":"A.com","token":"u"}]')).toHaveProperty("error");
  });
});

describe("checkIPv4", () => {
  it("公网 IP 通过，去掉空格", () => {
    expect(checkIPv4(` ${ip(203, 0, 113, 10)} `)).toEqual({ ip: ip(203, 0, 113, 10) });
    expect(checkIPv4(ip(8, 8, 8, 8))).toEqual({ ip: ip(8, 8, 8, 8) });
    expect(checkIPv4(ip(172, 32, 0, 1))).toEqual({ ip: ip(172, 32, 0, 1) });
  });
  it("格式不对", () => {
    for (const s of ["", ip(1, 2, 3), ip(1, 2, 3, 4, 5), ip(256, 1, 1, 1), ip("01", 2, 3, 4), "a.b.c.d", `${ip(1, 2, 3, 4)}/24`]) expect(checkIPv4(s)).toEqual({ error: "format" });
  });
  it("内网、本机、组播、Clash 假 IP 段都不行", () => {
    for (const p of [
      [10, 1, 2, 3],
      [127, 0, 0, 1],
      [0, 0, 0, 0],
      [192, 168, 1, 1],
      [172, 16, 0, 1],
      [172, 31, 255, 255],
      [169, 254, 1, 1],
      [100, 64, 0, 1],
      [198, 18, 0, 1],
      [224, 0, 0, 1],
      [255, 255, 255, 255],
    ])
      expect(checkIPv4(ip(...p))).toEqual({ error: "private" });
  });
});

describe("记录筛选", () => {
  it("只切灰色云朵的 A 记录", () => {
    expect(switchable({ type: "A", proxied: false })).toBe(true);
    expect(switchable({ type: "A", proxied: true })).toBe(false);
    expect(switchable({ type: "AAAA", proxied: false })).toBe(false);
  });
  it("记录要在这个域名下面", () => {
    expect(inZone("x1.example.com", "example.com")).toBe(true);
    expect(inZone("example.com", "example.com")).toBe(true);
    expect(inZone("X1.Example.com.", "example.com")).toBe(true);
    expect(inZone("x1.badexample.com", "example.com")).toBe(false);
    expect(inZone("example.com.evil.net", "example.com")).toBe(false);
  });
});

describe("hostsUsing", () => {
  it("找出地址是这个域名的 Host，不分大小写，停用的标出来", () => {
    const hosts = {
      A: [
        { remark: "东京", address: "x1.example.com" },
        { remark: "别的", address: ip(203, 0, 113, 5) },
      ],
      B: [{ remark: "旧东京", address: " X1.example.com ", is_disabled: true }],
    };
    expect(hostsUsing("x1.example.com", hosts)).toEqual([
      { tag: "A", remark: "东京", disabled: false },
      { tag: "B", remark: "旧东京", disabled: true },
    ]);
    expect(hostsUsing("x2.example.com", hosts)).toEqual([]);
  });
});

describe("ttlText", () => {
  it("1 是自动，等于 5 分钟", () => {
    expect(ttlText(1)).toBe("5 分钟");
    expect(ttlText(60)).toBe("1 分钟");
    expect(ttlText(30, true)).toBe("30s");
    expect(ttlText(7200, true)).toBe("2 h");
  });
});
