import { describe, expect, it } from "vitest";
import { daysLeft, dueNotice, noticeDays } from "./expiry-notice";
import type { Plan } from "../site.config.example";

const plan = (days: number, price = 1000): Plan => ({ id: `p${days}`, name: "x", price, days, dataGB: null, ip: 2 });
const DAY = 86400;
const now = 1_800_000_000;

// 每天北京时间 10:00 跑：2026-11-07 10:00 北京 = 02:00 UTC
const bj = (m: number, d: number, h: number) => Date.UTC(2026, m - 1, d, h - 8) / 1000;
const run = bj(11, 7, 10);

describe("noticeDays", () => {
  it("免费体验发 1 天和当天", () => expect(noticeDays(plan(7, 0))).toEqual([1, 0]));
  it("月付和不知道套餐的发 2 天和当天", () => {
    expect(noticeDays(plan(30))).toEqual([2, 0]);
    expect(noticeDays(undefined)).toEqual([2, 0]);
  });
  it("季付、半年、一年发 7 天、2 天和当天", () => {
    for (const d of [90, 180, 365]) expect(noticeDays(plan(d))).toEqual([7, 2, 0]);
  });
});

describe("dueNotice", () => {
  const year = plan(365);
  it("还早不发", () => expect(dueNotice(year, bj(11, 15, 12), run)).toBeNull());
  it("7 天后的那天到期发 7 天那封", () => expect(dueNotice(year, bj(11, 14, 23), run)).toBe(7));
  it("剩 4 天还是 7 天那档（已经发过就不再发）", () => expect(dueNotice(year, bj(11, 11, 12), run)).toBe(7));
  it("后天到期发 2 天那封", () => expect(dueNotice(year, bj(11, 9, 20), run)).toBe(2));
  it("今天晚上到期发当天那封", () => expect(dueNotice(year, bj(11, 7, 20), run)).toBe(0));
  it("明早 9 点到期：前一天 10 点就发最后一封（标题按日期写明天），不能等到当天断了才发", () => {
    expect(dueNotice(plan(30), bj(11, 8, 9), run)).toBe(0);
    expect(dueNotice(year, bj(11, 8, 9), run)).toBe(0);
    expect(dueNotice(plan(7, 0), bj(11, 8, 9), run)).toBe(0);
    expect(daysLeft(bj(11, 8, 9), run)).toBe(1);
  });
  it("明天晚上到期：前一天还在 2 天那档（发过不重发），当天 10 点发最后一封", () => {
    expect(dueNotice(plan(30), bj(11, 8, 20), run)).toBe(2);
    expect(dueNotice(plan(30), bj(11, 8, 20), bj(11, 8, 10))).toBe(0);
  });
  it("今天凌晨已经到期还发当天那封（邮件写已到期）", () => expect(dueNotice(year, bj(11, 7, 8), run)).toBe(0));
  it("刚过期还发当天那封", () => expect(dueNotice(year, now - 3600, now)).toBe(0));
  it("过期两天以上不再发", () => expect(dueNotice(year, now - 3 * DAY, now)).toBeNull());
  it("月付 3 天后到期不发，后天到期发", () => {
    expect(dueNotice(plan(30), bj(11, 10, 20), run)).toBeNull();
    expect(dueNotice(plan(30), bj(11, 9, 8), run)).toBe(2);
  });
  it("免费体验后天到期不发，明天到期发 1 天那封，当天发", () => {
    expect(dueNotice(plan(7, 0), bj(11, 9, 20), run)).toBeNull();
    expect(dueNotice(plan(7, 0), bj(11, 8, 20), run)).toBe(1);
    expect(dueNotice(plan(7, 0), bj(11, 7, 20), run)).toBe(0);
  });
  it("daysLeft 按北京日期算：明早 8 点是 1，今晚是 0，后天是 2", () => {
    expect(daysLeft(bj(11, 8, 8), run)).toBe(1);
    expect(daysLeft(bj(11, 7, 23), run)).toBe(0);
    expect(daysLeft(bj(11, 9, 1), run)).toBe(2);
  });
  it("永不到期不发", () => expect(dueNotice(year, null, now)).toBeNull());
});
