import { describe, expect, it } from "vitest";
import { formatBytes, formatExpire, parseSubToken, timeLeft } from "./format";
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
});

describe("密码哈希", () => {
  it("正确密码通过、错误密码不通过", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("pbkdf2$100000$")).toBe(true);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});
