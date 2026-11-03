import { describe, expect, it } from "vitest";
import { isWechat } from "./wechat";

describe("isWechat", () => {
  it("认出微信内置浏览器", () => {
    expect(isWechat("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50(0x18003237) NetType/WIFI")).toBe(true);
    expect(isWechat("Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36 MMWEBID/1234 MicroMessenger/8.0.47.2560")).toBe(true);
  });
  it("系统浏览器不算", () => {
    expect(isWechat("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isWechat("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36")).toBe(false);
  });
});
