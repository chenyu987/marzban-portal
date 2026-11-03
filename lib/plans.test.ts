import { describe, expect, it } from "vitest";
import type { Plan } from "../site.config.example";
import { changePlanBody, findPlan, newUserBody, nextUsername, renewUserBody, renewedExpire, setIpNote, wechatUsername } from "./plans";

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
  it("有微信号就用微信号，第二个起加序号", () => {
    expect(nextUsername(7, [], "Alice-88")).toBe("alice_88");
    expect(nextUsername(7, ["alice_88"], "Alice-88")).toBe("alice_88_2");
    expect(nextUsername(7, ["c7_1", "alice_88", "alice_88_3"], "Alice-88")).toBe("alice_88_4");
  });
  it("微信号太短或全是怪字符时退回 c<id>_<序号>", () => {
    expect(wechatUsername("ab")).toBeNull();
    expect(nextUsername(7, ["c7_1"], "")).toBe("c7_2");
    expect(nextUsername(7, [], null)).toBe("c7_1");
  });
  it("太长的截到 28 位", () => {
    expect(wechatUsername("a".repeat(40))).toBe("a".repeat(28));
  });
});

describe("请求体", () => {
  it("新开：流量、到期、设备数", () => {
    expect(newUserBody("c7_1", plan, now)).toMatchObject({
      username: "c7_1",
      proxies: { vless: { flow: "xtls-rprx-vision" } },
      inbounds: {},
      expire: now + 30 * 86400,
      data_limit: 100 * 1024 ** 3,
      note: "ip=3",
    });
  });
  it("只开 VLESS，入站明确写 {} 让 Marzban 勾上全部 VLESS 入站", () => {
    const b = newUserBody("c7_1", plan, now);
    expect(Object.keys(b.proxies)).toEqual(["vless"]);
    expect(b).toHaveProperty("inbounds", {});
  });
  it("备注就是 ip=N，IP 监控按这个读", () => {
    expect(newUserBody("c7_1", { ...plan, ip: 2 }, now).note).toBe("ip=2");
    expect(newUserBody("c7_1", { ...plan, ip: 0 }, now).note).toBe("ip=0");
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

describe("changePlanBody", () => {
  it("只改流量、重置方式和 ip=N，备注里别的内容保留，不碰到期时间", () => {
    const limited = { id: "a", name: "a", price: 1, days: 30, dataGB: 20, dataReset: "month" as const, ip: 2 };
    const unlimited = { id: "b", name: "b", price: 1, days: 30, dataGB: null, ip: 5 };
    expect(changePlanBody({ note: "老客人 ip=2" }, unlimited)).toEqual({ data_limit: 0, data_limit_reset_strategy: "no_reset", note: "老客人 ip=5" });
    expect(changePlanBody({ note: null }, limited)).toEqual({ data_limit: 20 * 1024 ** 3, data_limit_reset_strategy: "month", note: "ip=2" });
    expect(changePlanBody({}, limited)).not.toHaveProperty("expire");
  });
});

describe("免费体验套餐", () => {
  it("每个档位都有一个 7 天、免费、只能用兑换码开的体验；客人能买的套餐里没有它", async () => {
    const { site } = await import("../site.config");
    const { forSale } = await import("./plans");
    const groups = [...new Set(site.plans.map((p) => p.group ?? p.name))];
    for (const g of groups) {
      const trial = site.plans.find((p) => (p.group ?? p.name) === g && p.codeOnly);
      expect(trial, `${g} 没有体验套餐`).toBeDefined();
      expect(trial).toMatchObject({ price: 0, days: 7 });
    }
    expect(forSale(site.plans).some((p) => p.codeOnly)).toBe(false);
    expect(forSale(site.plans).length).toBe(site.plans.length - groups.length);
  });

  it("在体验上续费：流量、设备数换成续费的套餐，到期时间接着体验往后加", async () => {
    const { site } = await import("../site.config");
    const { renewUserBody } = await import("./plans");
    const trial = site.plans.find((p) => p.id.endsWith("-trial") && p.dataGB === 20)!;
    const paid = site.plans.find((p) => !p.codeOnly && p.dataGB === null && p.days === 30)!;
    const now = 1_000_000;
    const body = renewUserBody({ expire: now + 3 * 86400, note: `ip=${trial.ip}` }, paid, now);
    expect(body.data_limit).toBe(0);
    expect(body.expire).toBe(now + 3 * 86400 + 30 * 86400);
    expect(body.note).toContain(`ip=${paid.ip}`);
  });
});

