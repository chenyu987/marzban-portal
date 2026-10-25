import { describe, expect, it } from "vitest";
import type { Plan } from "../site.config.example";
import { findPlan, newUserBody, nextUsername, renewUserBody, renewedExpire, setIpNote } from "./plans";

const now = 1_800_000_000;
const plan: Plan = { id: "month", name: "月付", price: 2000, days: 30, dataGB: 100, ip: 3 };

describe("renewedExpire", () => {
  it("没过期的从原到期时间往后加", () => {
    expect(renewedExpire(now + 5 * 86400, 30, now)).toBe(now + 35 * 86400);
  });
  it("已过期或没有到期时间的从现在算", () => {
    expect(renewedExpire(now - 86400, 30, now)).toBe(now + 30 * 86400);
    expect(renewedExpire(null, 30, now)).toBe(now + 30 * 86400);
  });
});

describe("setIpNote", () => {
  it("只改 ip= 这一项", () => {
    expect(setIpNote("老客户 ip=5 微信", 3)).toBe("老客户 ip=3 微信");
    expect(setIpNote("ip=不限", 2)).toBe("ip=2");
  });
  it("没有就加在最后", () => {
    expect(setIpNote("", 3)).toBe("ip=3");
    expect(setIpNote(null, 3)).toBe("ip=3");
    expect(setIpNote("老客户 ", 0)).toBe("老客户 ip=0");
  });
  it("不会把别的词里的 ip= 当成这一项", () => {
    expect(setIpNote("vip=1", 3)).toBe("vip=1 ip=3");
  });
});

describe("nextUsername", () => {
  it("接着已有的序号往下排，忽略别人的和老用户名", () => {
    expect(nextUsername(7, [])).toBe("c7_1");
    expect(nextUsername(7, ["alice", "c7_1", "c7_3", "c17_9"])).toBe("c7_4");
  });
});

describe("请求体", () => {
  it("新开：流量、到期、设备数", () => {
    expect(newUserBody("c7_1", plan, now)).toMatchObject({
      username: "c7_1",
      proxies: { vless: { flow: "xtls-rprx-vision" } },
      expire: now + 30 * 86400,
      data_limit: 100 * 1024 ** 3,
      note: "ip=3",
    });
  });
  it("不限流量写 0", () => {
    expect(newUserBody("c7_1", { ...plan, dataGB: null }, now).data_limit).toBe(0);
  });
  it("续期保留备注里别的内容", () => {
    expect(renewUserBody({ expire: now + 86400, note: "老客户 ip=5" }, plan, now)).toEqual({
      expire: now + 31 * 86400,
      data_limit: 100 * 1024 ** 3,
      data_limit_reset_strategy: "no_reset",
      status: "active",
      note: "老客户 ip=3",
    });
  });
  it("按月清零的流量", () => {
    expect(newUserBody("c7_1", { ...plan, dataGB: 20, dataReset: "month" }, now).data_limit_reset_strategy).toBe("month");
    expect(newUserBody("c7_1", { ...plan, dataGB: null, dataReset: "month" }, now).data_limit_reset_strategy).toBe("no_reset");
  });
  it("findPlan", () => {
    expect(findPlan([plan], "month")).toBe(plan);
    expect(findPlan([plan], "year")).toBeUndefined();
  });
});
