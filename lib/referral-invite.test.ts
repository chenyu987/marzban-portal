import { describe, expect, it } from "vitest";
import { referralInvite } from "./referral-invite";

describe("referralInvite", () => {
  it("带品牌、推荐链接、推荐码和从注册到导入的几步", () => {
    const s = referralInvite("Brand", "https://example.test/register?ref=ABCD1234", "ABCD1234");
    expect(s).toContain("我在用 Brand");
    expect(s).toContain("https://example.test/register?ref=ABCD1234");
    expect(s).toContain("推荐码 ABCD1234 已经自动填好");
    expect(s).toMatch(/购买\/续费[\s\S]*我已付款[\s\S]*一键导入/);
    expect(referralInvite("Brand", "L", "C", "en")).toContain("I use Brand");
  });

  it("不写能上哪些网站，以一键导入那步结尾", () => {
    for (const lang of ["zh", "en"] as const) {
      const s = referralInvite("Brand", "L", "C", lang);
      expect(s).not.toMatch(/ChatGPT|Claude|国外网站|联系客服|Contact support/);
    }
    expect(referralInvite("Brand", "L", "C").endsWith("点「一键导入」就能用")).toBe(true);
  });
});
