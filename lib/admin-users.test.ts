import { describe, expect, it } from "vitest";
import { parseOnHoldDays, createUserBody, describeChanges, fromBeijingInput, monthStartBeijing, onlineText, parseExpiredDays, parseNodeForm, validateHosts, parseUserForm, toBeijingInput } from "./admin-users";

const GB = 1024 ** 3;
const form = (o: Record<string, string>) => (k: string) => o[k] ?? "";
const now = 1_800_000_000;

describe("北京时间输入框", () => {
  it("来回转换一致", () => {
    expect(toBeijingInput(null)).toBe("");
    const v = toBeijingInput(now);
    expect(fromBeijingInput(v)).toBe(now - (now % 60));
    expect(fromBeijingInput("2026-12-03T02:15")).toBe(Date.parse("2026-12-02T18:15:00Z") / 1000);
    expect(fromBeijingInput("明天")).toBeNull();
  });
});

describe("parseUserForm", () => {
  it("留空就是不限流量、永不到期", () => {
    expect(parseUserForm(form({}), { now })).toEqual({
      fields: { data_limit: 0, data_limit_reset_strategy: "no_reset", expire: 0, note: "", status: "active" },
    });
  });
  it("流量、重置、到期、备注、状态", () => {
    const r = parseUserForm(form({ dataGB: "20", resetStrategy: "month", expire: "2026-12-03T02:15", note: " ip=2 ", status: "disabled" }), { now });
    expect(r).toEqual({
      fields: { data_limit: 20 * GB, data_limit_reset_strategy: "month", expire: fromBeijingInput("2026-12-03T02:15"), note: "ip=2", status: "disabled" },
    });
  });
  it("不限流量时重置方式没意义，改成 no_reset", () => {
    const r = parseUserForm(form({ resetStrategy: "month" }), { now });
    expect("fields" in r && r.fields.data_limit_reset_strategy).toBe("no_reset");
  });
  it("续期天数从原到期往后加，已过期从现在算", () => {
    const later = parseUserForm(form({ addDays: "30", expire: "2020-01-01T00:00" }), { now, currentExpire: now + 5 * 86400 });
    expect("fields" in later && later.fields.expire).toBe(now + 35 * 86400);
    const expired = parseUserForm(form({ addDays: "30" }), { now, currentExpire: now - 86400 });
    expect("fields" in expired && expired.fields.expire).toBe(now + 30 * 86400);
  });
  it("填错给出原因", () => {
    expect(parseUserForm(form({ dataGB: "-1" }), { now })).toHaveProperty("error");
    expect(parseUserForm(form({ resetStrategy: "hour" }), { now })).toHaveProperty("error");
    expect(parseUserForm(form({ expire: "2026/12/03" }), { now })).toHaveProperty("error");
    expect(parseUserForm(form({ addDays: "1.5" }), { now })).toHaveProperty("error");
    expect(parseUserForm(form({ status: "expired" }), { now })).toHaveProperty("error");
  });
});

describe("其他", () => {
  it("新建请求体只开 VLESS，入站交给 Marzban 全勾", () => {
    const f = { data_limit: 0, data_limit_reset_strategy: "no_reset" as const, expire: 0, note: "", status: "active" as const };
    expect(createUserBody("bob_1", f)).toMatchObject({ username: "bob_1", proxies: { vless: {} }, inbounds: {} });
  });
  it("在线时间", () => {
    const at = (min: number) => new Date(now * 1000 - min * 60000).toISOString().replace("Z", "");
    expect(onlineText(null, now * 1000)).toBe("没连过");
    expect(onlineText(at(1), now * 1000)).toBe("在线");
    expect(onlineText(at(30), now * 1000)).toBe("30 分钟前");
    expect(onlineText(at(180), now * 1000)).toBe("3 小时前");
    expect(onlineText(at(3 * 24 * 60), now * 1000)).toBe("3 天前");
  });
  it("改了什么", () => {
    const after = { data_limit: 0, data_limit_reset_strategy: "no_reset" as const, expire: 100, note: "ip=2", status: "active" as const };
    const fmt = (k: string, v: unknown) => `${k}=${v ?? ""}`;
    expect(describeChanges({ ...after }, after, fmt)).toBe("没改动");
    expect(describeChanges({ ...after, expire: 50, data_limit: null as unknown as number }, after, fmt)).toBe("expire=50 → expire=100");
  });
});

describe("parseNodeForm", () => {
  it("默认端口 62050 / 62051、倍率 1", () => {
    expect(parseNodeForm(form({ name: "东京", address: "tokyo.example.com" }))).toEqual({
      fields: { name: "东京", address: "tokyo.example.com", port: 62050, api_port: 62051, usage_coefficient: 1 },
    });
  });
  it("域名、IPv6、自定义端口和倍率", () => {
    expect(parseNodeForm(form({ name: "a", address: "node.example.com", port: "1000", apiPort: "1001", coefficient: "0.5" }))).toHaveProperty("fields.usage_coefficient", 0.5);
    expect(parseNodeForm(form({ name: "a", address: "2001:db8::1" }))).toHaveProperty("fields.address", "2001:db8::1");
  });
  it("填错给出原因", () => {
    expect(parseNodeForm(form({ address: "tokyo.example.com" }))).toHaveProperty("error");
    expect(parseNodeForm(form({ name: "a", address: "http://tokyo.example.com" }))).toHaveProperty("error");
    expect(parseNodeForm(form({ name: "a", address: "tokyo.example.com", port: "70000" }))).toHaveProperty("error");
    expect(parseNodeForm(form({ name: "a", address: "tokyo.example.com", port: "100", apiPort: "100" }))).toHaveProperty("error");
    expect(parseNodeForm(form({ name: "a", address: "tokyo.example.com", coefficient: "0" }))).toHaveProperty("error");
  });
});

describe("monthStartBeijing", () => {
  it("北京时间的月初，跨 UTC 日界也对", () => {
    // 北京时间 2026-12-01 03:00 = UTC 11-30 19:00，月初应是北京 12-01 00:00 = UTC 11-30 16:00
    expect(monthStartBeijing(Date.parse("2026-11-30T19:00:00Z")).toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(monthStartBeijing(Date.parse("2026-11-15T00:00:00Z")).toISOString()).toBe("2026-10-31T16:00:00.000Z");
  });
});

describe("validateHosts", () => {
  const ok = { remark: "🇯🇵 东京 {USERNAME}", address: "jp.example.com", port: "", security: "inbound_default", mux_enable: true };
  it("整理字段，后台不改的字段原样带回去", () => {
    expect(validateHosts([{ ...ok, sni: " ", path: "/x " }])).toEqual({
      hosts: [{ ...ok, port: null, sni: null, host: null, path: "/x", is_disabled: false }],
    });
    expect(validateHosts([{ ...ok, port: "8443", is_disabled: 1 }])).toHaveProperty("hosts.0.port", 8443);
    expect(validateHosts([])).toEqual({ hosts: [] });
  });
  it("填错给出是第几个、哪里错", () => {
    expect(validateHosts("x")).toHaveProperty("error");
    expect(validateHosts([{ ...ok, remark: " " }])).toEqual({ error: "第 1 个 Host的备注（客人看到的节点名）不能空" });
    expect(validateHosts([ok, { ...ok, address: "" }])).toHaveProperty("error", "第 2 个 Host的地址不能空");
    expect(validateHosts([{ ...ok, address: "https://jp.example.com" }])).toHaveProperty("error");
    expect(validateHosts([{ ...ok, port: "0" }])).toHaveProperty("error");
    expect(validateHosts([{ ...ok, security: "reality" }])).toHaveProperty("error");
  });
});

describe("parseExpiredDays", () => {
  it("只收 1–3650 的整数", () => {
    expect(parseExpiredDays(" 30 ")).toBe(30);
    for (const bad of ["", "0", "-1", "1.5", "3651", "abc"]) expect(parseExpiredDays(bad)).toBeNull();
  });
});

describe("首次连上才开始计时", () => {
  const f = { data_limit: 0, data_limit_reset_strategy: "no_reset" as const, expire: 1_900_000_000, note: "", status: "active" as const };
  it("填了天数：状态 on_hold、不设到期、连上后有效 N 天", () => {
    expect(createUserBody("trial_1", f, 3)).toMatchObject({ status: "on_hold", expire: 0, on_hold_expire_duration: 3 * 86400 });
    expect(createUserBody("trial_1", f)).toMatchObject({ status: "active", expire: 1_900_000_000 });
    expect(createUserBody("trial_1", f)).not.toHaveProperty("on_hold_expire_duration");
  });
  it("天数校验", () => {
    expect(parseOnHoldDays("")).toEqual({ days: null });
    expect(parseOnHoldDays(" 7 ")).toEqual({ days: 7 });
    for (const bad of ["0", "1.5", "abc", "9999"]) expect(parseOnHoldDays(bad)).toHaveProperty("error");
  });
});
