import { describe, expect, it } from "vitest";
import { createUserBody, describeChanges, fromBeijingInput, onlineText, parseUserForm, toBeijingInput } from "./admin-users";

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
