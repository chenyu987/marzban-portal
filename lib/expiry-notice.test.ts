import { describe, expect, it } from "vitest";
import { dueNotice, noticeDays } from "./expiry-notice";
import type { Plan } from "../site.config.example";

const plan = (days: number, price = 1000): Plan => ({ id: `p${days}`, name: "x", price, days, dataGB: null, ip: 2 });
const DAY = 86400;
const now = 1_800_000_000;

describe("noticeDays", () => {
  it("免费体验发 1 天和当天", () => expect(noticeDays(plan(7, 0))).toEqual([1, 0]));
  it("月付和不知道套餐的发 3 天和当天", () => {
    expect(noticeDays(plan(30))).toEqual([3, 0]);
    expect(noticeDays(undefined)).toEqual([3, 0]);
  });
  it("季付、半年、一年发 7 天、3 天和当天", () => {
    for (const d of [90, 180, 365]) expect(noticeDays(plan(d))).toEqual([7, 3, 0]);
  });
});

describe("dueNotice", () => {
  const year = plan(365);
  it("还早不发", () => expect(dueNotice(year, now + 8 * DAY + 1, now)).toBeNull());
  it("剩 7 天多发 7 天那封", () => expect(dueNotice(year, now + 7 * DAY + 3600, now)).toBe(7));
  it("剩 4 天还是 7 天那档（已经发过就不再发）", () => expect(dueNotice(year, now + 4 * DAY + 3600, now)).toBe(7));
  it("剩 3 天多发 3 天那封", () => expect(dueNotice(year, now + 3 * DAY + 3600, now)).toBe(3));
  it("今天到期（不到 1 天）发当天那封", () => expect(dueNotice(year, now + 3 * 3600, now)).toBe(0));
  it("刚过期还发当天那封", () => expect(dueNotice(year, now - 3600, now)).toBe(0));
  it("过期两天以上不再发", () => expect(dueNotice(year, now - 3 * DAY, now)).toBeNull());
  it("月付剩 5 天不发，剩 3 天发", () => {
    expect(dueNotice(plan(30), now + 5 * DAY, now)).toBeNull();
    expect(dueNotice(plan(30), now + 3 * DAY + 60, now)).toBe(3);
  });
  it("免费体验剩 3 天不发，剩 1 天多发 1 天那封，当天发", () => {
    expect(dueNotice(plan(7, 0), now + 3 * DAY, now)).toBeNull();
    expect(dueNotice(plan(7, 0), now + DAY + 3600, now)).toBe(1);
    expect(dueNotice(plan(7, 0), now + 3600, now)).toBe(0);
  });
  it("永不到期不发", () => expect(dueNotice(year, null, now)).toBeNull());
});
