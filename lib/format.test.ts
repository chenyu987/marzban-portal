import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, formatExpire, formatMoney, maskEmail, formatRedeemCode, needsRenewal, newRedeemCode, newReferralCode, normalizeRedeemCode, normalizeReferralCode, parseSubToken, parseYuan, timeLeft, formatOrderNo, parseOrderNo } from "./format";
import { hashPassword, verifyPassword } from "./password";

describe("parseSubToken", () => {
  const t = "eyJhbGciOiJIUzI1NiJ9.abc_DEF-123";
  it("取出完整链接里的 token", () => {
    expect(parseSubToken(`https://panel.example.com:8000/sub/${t}`)).toBe(t);
  });
  it("容忍末尾斜杠、客户端类型、空格和查询参数", () => {
    expect(parseSubToken(`  https://x.com/sub/${t}/  `)).toBe(t);
    expect(parseSubToken(`https://x.com/sub/${t}/clash-meta`)).toBe(t);
    expect(parseSubToken(`https://x.com/sub/${t}?foo=1`)).toBe(t);
  });
  it("不是订阅链接就返回 null", () => {
    expect(parseSubToken("https://x.com/dashboard")).toBeNull();
    expect(parseSubToken("hello")).toBeNull();
    expect(parseSubToken("https://x.com/sub/short")).toBeNull();
  });
});

describe("formatBytes", () => {
  it("小于 1GB 显示 MB，大于 10GB 保留一位小数", () => {
    expect(formatBytes(500 * 1024 ** 2)).toBe("500 MB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.50 GB");
    expect(formatBytes(37.4 * 1024 ** 3)).toBe("37.4 GB");
  });
});

describe("到期时间", () => {
  it("按北京时间显示", () => {
    // 2026-11-01 00:00 UTC = 北京时间 08:00
    expect(formatExpire(Date.UTC(2026, 10, 1) / 1000)).toBe("2026/11/01 08:00");
    expect(formatExpire(null)).toBe("永不到期");
  });
  it("剩余时间往下取整到小时", () => {
    const h = 3600;
    expect(timeLeft(4 * 86400 + 7.5 * h, 0)).toEqual({ text: "还剩 4 天 7 小时", urgent: false });
    expect(timeLeft(4 * 86400 + 10, 0)).toEqual({ text: "还剩 4 天", urgent: false });
    expect(timeLeft(2 * 86400 + h, 0)).toEqual({ text: "还剩 2 天 1 小时", urgent: true });
    expect(timeLeft(5 * h + 59, 0)).toEqual({ text: "还剩 5 小时", urgent: true });
    expect(timeLeft(30 * 60, 0)).toEqual({ text: "不到 1 小时", urgent: true });
    expect(timeLeft(-1, 0)).toEqual({ text: "已到期", urgent: true });
    expect(timeLeft(null)).toBeNull();
  });
  it("剩 7 天以内或已到期才提醒续费，永不到期的不提醒", () => {
    expect(needsRenewal(8 * 86400, 0)).toBe(false);
    expect(needsRenewal(7 * 86400, 0)).toBe(false);
    expect(needsRenewal(7 * 86400 - 1, 0)).toBe(true);
    expect(needsRenewal(-86400, 0)).toBe(true);
    expect(needsRenewal(null, 0)).toBe(false);
  });
});

describe("密码哈希", () => {
  it("正确密码通过、错误密码不通过", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("pbkdf2$100000$")).toBe(true);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("推荐码", () => {
  it("新生成的推荐码能通过校验", () => {
    for (let i = 0; i < 20; i++) {
      const c = newReferralCode();
      expect(normalizeReferralCode(c)).toBe(c);
    }
  });
  it("忽略大小写、空格、横线", () => {
    expect(normalizeReferralCode(" abcd-efgh ")).toBe("ABCDEFGH");
  });
  it("整条推荐链接也能认出来", () => {
    expect(normalizeReferralCode("https://x.com/register?ref=abcdefgh")).toBe("ABCDEFGH");
  });
  it("没填返回空字符串，格式不对返回 null", () => {
    expect(normalizeReferralCode("  ")).toBe("");
    expect(normalizeReferralCode("ABC")).toBeNull();
    expect(normalizeReferralCode("ABCDEFG0")).toBeNull();
  });
  it("链接里 ref 的编码坏了也不报错，当成格式不对", () => {
    expect(normalizeReferralCode("https://x.com/register?ref=%E0%A4%A")).toBeNull();
    expect(normalizeReferralCode("?ref=%")).toBeNull();
  });
});

describe("maskEmail", () => {
  it("只露出前两位和域名", () => {
    expect(maskEmail("alice@gmail.com")).toBe("al***@gmail.com");
    expect(maskEmail("ab@qq.com")).toBe("a***@qq.com");
  });
});

describe("formatDate", () => {
  it("按北京时间显示日期", () => {
    // 2026-10-24 16:30 UTC 是北京时间 10-25 00:30
    expect(formatDate(Date.UTC(2026, 9, 24, 16, 30) / 1000)).toBe("2026/10/25");
  });
});

describe("formatMoney", () => {
  it("分显示成两位小数", () => {
    expect(formatMoney(0)).toBe("0.00");
    expect(formatMoney(5)).toBe("0.05");
    expect(formatMoney(1990)).toBe("19.90");
    expect(formatMoney(-150)).toBe("-1.50");
  });
});

describe("parseYuan", () => {
  it("元换成分", () => {
    expect(parseYuan("30")).toBe(3000);
    expect(parseYuan(" 30.5 ")).toBe(3050);
    expect(parseYuan("0.01")).toBe(1);
  });
  it("不是正数或超过两位小数返回 null", () => {
    expect(parseYuan("0")).toBeNull();
    expect(parseYuan("-1")).toBeNull();
    expect(parseYuan("1.234")).toBeNull();
    expect(parseYuan("abc")).toBeNull();
  });
});

describe("兑换码", () => {
  it("生成 16 位，能被自己的格式认出来", () => {
    const code = newRedeemCode();
    expect(code).toHaveLength(16);
    expect(normalizeRedeemCode(code)).toBe(code);
    expect(newRedeemCode()).not.toBe(code);
  });
  it("忽略大小写、空格和横线", () => {
    expect(normalizeRedeemCode(" abcd-efgh-jkmn-pqrs ")).toBe("ABCDEFGHJKMNPQRS");
    expect(formatRedeemCode("ABCDEFGHJKMNPQRS")).toBe("ABCD-EFGH-JKMN-PQRS");
  });
  it("长度不对或有容易看错的字符返回 null", () => {
    expect(normalizeRedeemCode("ABCD")).toBeNull();
    expect(normalizeRedeemCode("ABCDEFGHJKMNPQR0")).toBeNull();
    expect(normalizeRedeemCode("")).toBeNull();
  });
});

describe("订单号", () => {
  it("显示成日期-编号，搜的时候带不带横线都认", () => {
    expect(formatOrderNo("26110348213")).toBe("261103-48213");
    expect(formatOrderNo(null)).toBe("-");
    expect(parseOrderNo("261103-48213")).toBe("26110348213");
    expect(parseOrderNo(" 26110348213 ")).toBe("26110348213");
    expect(parseOrderNo("12")).toBeNull();
    expect(parseOrderNo("alice")).toBeNull();
  });
});
