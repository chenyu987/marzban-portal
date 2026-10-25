import { describe, expect, it } from "vitest";
import { hashResetToken, newResetToken, resetLink } from "./reset";

describe("重置密码 token", () => {
  it("每次都不一样，只含网址里安全的字符", () => {
    const a = newResetToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newResetToken()).not.toBe(a);
  });
  it("哈希固定、和原文不同", async () => {
    const t = newResetToken();
    expect(await hashResetToken(t)).toBe(await hashResetToken(t));
    expect(await hashResetToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("链接用配置的站点地址拼，去掉结尾斜杠", () => {
    expect(resetLink("https://portal.example.com/", "abc")).toBe("https://portal.example.com/reset?token=abc");
  });
});
