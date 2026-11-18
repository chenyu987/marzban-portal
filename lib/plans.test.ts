import { describe, expect, it } from "vitest";
import type { Plan } from "../site.config.example";
import { changePlanBody, findPlan, newUserBody, nextUsername, planInbounds, renewUserBody, renewedExpire, isWechatUsername, setIpNote, upgradeOptions, wechatUsername } from "./plans";

const now = 1_800_000_000;
const plan: Plan = { id: "month", name: "月付", price: 2000, days: 30, dataGB: 100, ip: 3 };

describe("planInbounds", () => {
  const all = ["VLESS TCP REALITY", "VLESS SEL", "VLESS LAX"];
  it("Basic 去掉只给 Pro 的入站，Pro 全要", () => {
    expect(planInbounds(plan, all, ["VLESS LAX"])).toEqual(["VLESS TCP REALITY", "VLESS SEL"]);
    expect(planInbounds({ ...plan, pro: true }, all, ["VLESS LAX"])).toEqual(all);
  });
  it("没配 proOnly 就不分档", () => {
    expect(planInbounds(plan, all, undefined)).toBeUndefined();
    expect(planInbounds(plan, all, [])).toBeUndefined();
  });
  it("一个入站都分不到时报错，不开一个连不上的用户", () => {
    expect(() => planInbounds(plan, ["VLESS LAX"], ["VLESS LAX"])).toThrow();
  });
  it("改用户的请求体带完整的入站列表；不传就不碰入站", () => {
    expect(changePlanBody({}, plan, ["A", "B"])).toMatchObject({ inbounds: { vless: ["A", "B"] } });
    expect(changePlanBody({}, plan)).not.toHaveProperty("inbounds");
    expect(newUserBody("c7_1", plan, now, ["A"]).inbounds).toEqual({ vless: ["A"] });
  });
});

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


describe("isWechatUsername", () => {
  it("微信号本身和 微信号_数字 算，大小写、减号按 Marzban 用户名的规则转", () => {
    expect(isWechatUsername("Tom-123", "tom_123")).toBe(true);
    expect(isWechatUsername("tom_123", "tom_123_2")).toBe(true);
    expect(isWechatUsername("tom_123", "tom_123_15")).toBe(true);
  });
  it("前缀一样但不是序号的不算，别人的微信号不算", () => {
    expect(isWechatUsername("tom_123", "tom_1234")).toBe(false);
    expect(isWechatUsername("tom_123", "tom_123_x")).toBe(false);
    expect(isWechatUsername("tom_123", "tom_123_")).toBe(false);
    expect(isWechatUsername("tom", "tommy")).toBe(false);
  });
  it("微信号太短转不出用户名，什么都不算", () => {
    expect(isWechatUsername("ab", "ab")).toBe(false);
    expect(isWechatUsername("", "")).toBe(false);
  });
});

describe("升级套餐", () => {
  const P = (id: string, group: string, yuan: number, days = 30, extra: Partial<Plan> = {}): Plan => ({ id, name: id, group, price: yuan * 100, days, dataGB: null, ip: 2, ...extra });
  const plans = [
    P("p1-month", "普通", 25), P("p1-quarter", "普通", 64, 90), P("p1-trial", "普通", 0, 7, { codeOnly: true }),
    P("p3-month", "高速", 45), P("p3-quarter", "高速", 100, 90),
    P("p4-month", "双设备", 58), P("p4-quarter", "双设备", 158, 90),
  ];
  const now = 1_000_000;
  const in20 = now + 20 * 86400;

  it("只列更贵的档，按月付差价 × 剩余天数 ÷ 30 向上取整到元", () => {
    const opts = upgradeOptions(plans, "p3-quarter", in20, now);
    expect(opts.map((o) => [o.plan.id, o.price])).toEqual([["p4-month", 900]]); // (58-45)×20/30 = 8.67 → 9
    expect(upgradeOptions(plans, "p1-month", in20, now).map((o) => o.plan.id)).toEqual(["p3-month", "p4-month"]);
  });

  it("最贵的档、体验、到期了、永不到期、查不到套餐都不能升级", () => {
    expect(upgradeOptions(plans, "p4-month", in20, now)).toEqual([]);
    expect(upgradeOptions(plans, "p1-trial", in20, now)).toEqual([]);
    expect(upgradeOptions(plans, "p3-month", now - 1, now)).toEqual([]);
    expect(upgradeOptions(plans, "p3-month", null, now)).toEqual([]);
    expect(upgradeOptions(plans, undefined, in20, now)).toEqual([]);
  });

  it("只剩几个小时也至少收 1 元", () => {
    expect(upgradeOptions(plans, "p3-month", now + 3600, now)[0].price).toBe(100);
  });
});
