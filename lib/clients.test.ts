import { describe, expect, it } from "vitest";
import { AUTO_GROUP, CLASH_RULES, clashVergeImport, hiddifyImport, detectPlatform, primaryApp, shadowrocketImport, shadowrocketQr } from "./clients";

describe("客户端", () => {
  it("Shadowrocket 导入链接里是订阅链接的 base64", () => {
    const url = "https://sub.example.com:8000/sub/abc";
    expect(shadowrocketImport(url, "例子.com")).toBe(`shadowrocket://add/sub://${btoa(url)}?remark=${encodeURIComponent("例子.com")}`);
  });

  it("Shadowrocket 二维码是 sub://<base64>#名字，扫进去不显示域名", () => {
    const url = "https://sub.example.com:8000/sub/abc";
    expect(shadowrocketQr(url, "例子.com")).toBe(`sub://${btoa(url)}#${encodeURIComponent("例子.com")}`);
  });

  it("三个客户端导入后订阅都叫传进来的名字", () => {
    const url = "https://sub.example.com:8000/sub/abc";
    for (const link of [shadowrocketImport(url, "例子.com"), clashVergeImport(url, "例子.com"), hiddifyImport(url, "例子.com")]) expect(link).toContain(encodeURIComponent("例子.com"));
  });

  it("Clash 规则的组名和 Marzban 默认模板一致（♻ 后面带 U+FE0F）", () => {
    expect(AUTO_GROUP).toBe("♻️ Automatic");
    expect([...AUTO_GROUP][1]).toBe("️");
    expect(CLASH_RULES).toContain(`MATCH,${AUTO_GROUP}`);
  });

  it("ChatGPT 和 Claude 都走代理（回国用的人多）", () => {
    for (const d of ["openai.com", "chatgpt.com", "anthropic.com", "claude.ai", "claude.com", "claudeusercontent.com"]) {
      expect(CLASH_RULES).toContain(`DOMAIN-SUFFIX,${d},${AUTO_GROUP}`);
    }
    // 国内直连要在兜底规则前面，不然全走代理
    expect(CLASH_RULES.indexOf("GEOIP,CN,DIRECT")).toBeLessThan(CLASH_RULES.indexOf("MATCH,"));
  });

  it("按 User-Agent 认设备", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    // 订阅页的大按钮跟着设备换：iPhone Shadowrocket、Mac Clash Verge、Windows 和安卓 Hiddify，看不出来给 Shadowrocket
    expect(primaryApp("ios")).toBe("shadowrocket");
    expect(primaryApp("mac")).toBe("clash");
    expect(primaryApp("windows")).toBe("hiddify");
    expect(primaryApp("android")).toBe("hiddify");
    expect(primaryApp(null)).toBe("shadowrocket");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("mac");
  });
});
