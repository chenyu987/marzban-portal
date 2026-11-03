import { describe, expect, it } from "vitest";
import { describeDevice, parsePrefsForm } from "./admin-account";

describe("认登录设备", () => {
  it("常见的几种", () => {
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe("Mac · Chrome");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Windows · Edge");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50")).toBe("iPhone · 微信");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(describeDevice("")).toBe("未知设备");
    expect(describeDevice("curl/8.0")).toBe("未知设备");
  });
});

describe("后台偏好表单", () => {
  const form = (v: Record<string, string>) => (k: string) => v[k] ?? "";
  it("空的用默认", () => {
    expect(parsePrefsForm(form({}))).toEqual({ prefs: { pageSize: null, sort: null, time: "relative" } });
  });
  it("正常的", () => {
    expect(parsePrefsForm(form({ page_size: "100", sort: "expire", time: "absolute" }))).toEqual({ prefs: { pageSize: 100, sort: "expire", time: "absolute" } });
  });
  it("不在选项里的不收", () => {
    expect(parsePrefsForm(form({ page_size: "500" }))).toHaveProperty("error");
    expect(parsePrefsForm(form({ sort: "drop table" }))).toHaveProperty("error");
    expect(parsePrefsForm(form({ time: "x" }))).toHaveProperty("error");
  });
});
