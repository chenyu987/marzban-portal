import { describe, expect, it } from "vitest";
import type { Plan } from "../site.config.example";
import { codeMessages, parseCodeDays, withCodeDays } from "./redeem-codes";

const trial = { id: "p3-trial", name: "高速版 7天体验", en: "Fast, 7-day trial", group: "高速版", price: 0, days: 7, codeOnly: true } as Plan;
const month = { id: "p3-month", name: "高速版 月付", en: "Fast, Monthly", group: "高速版", price: 45, days: 30 } as Plan;

describe("兑换码天数", () => {
  it("parseCodeDays：空或等于套餐天数按套餐；超范围、小数报错", () => {
    expect(parseCodeDays("", trial)).toEqual({ days: null });
    expect(parseCodeDays("7", trial)).toEqual({ days: null });
    expect(parseCodeDays(" 10 ", trial)).toEqual({ days: 10 });
    expect(parseCodeDays("0", trial)).toHaveProperty("error");
    expect(parseCodeDays("3651", trial)).toHaveProperty("error");
    expect(parseCodeDays("2.5", trial)).toHaveProperty("error");
    expect(parseCodeDays("abc", trial)).toHaveProperty("error");
    expect(parseCodeDays("0", trial, "en")).toEqual({ error: "Days must be a whole number from 1 to 3650" });
  });

  it("withCodeDays：体验改名字里的天数，付费套餐名字后面加天数；没改原样返回", () => {
    expect(withCodeDays(trial, null)).toBe(trial);
    expect(withCodeDays(trial, 7)).toBe(trial);
    expect(withCodeDays(trial, 10)).toMatchObject({ days: 10, name: "高速版 10天体验", en: "Fast, 10-day trial", price: 0, id: "p3-trial" });
    expect(withCodeDays(month, 35)).toMatchObject({ days: 35, name: "高速版 月付（35 天）", en: "Fast, Monthly (35 days)", price: 45 });
  });

  it("codeMessages：短的只有兑换码，长的开头写「支付完成」（体验也一样，名字去掉「体验」），带天数和用法", () => {
    const m = codeMessages(["ABCD1234EFGH5678"], withCodeDays(trial, 10), "Brand", "https://example.test");
    expect(m.short).toBe("兑换码：ABCD-1234-EFGH-5678");
    expect(m.long).toContain("Brand 高速版 10天 支付完成，兑换码：\nABCD-1234-EFGH-5678");
    expect(m.long).toContain("https://example.test/register");
    expect(m.long).toContain("输入兑换码");
    const two = codeMessages(["ABCD1234EFGH5678", "WXYZ1234EFGH5678"], month, "Brand", "https://example.test");
    expect(two.short).toBe("兑换码（2 个）：\nABCD-1234-EFGH-5678\nWXYZ-1234-EFGH-5678");
    expect(two.long).toContain("Brand 高速版 月付（30 天） 支付完成，兑换码（2 个，每个只能用一次）");
  });
});
