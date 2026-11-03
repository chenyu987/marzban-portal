import { describe, expect, it } from "vitest";
import { AUTO_GROUP, CLASH_RULES, IMPORT_NAME, clashVergeImport, hiddifyImport, detectPlatform, shadowrocketImport } from "./clients";

describe("客户端", () => {
  it("Shadowrocket 导入链接里是订阅链接的 base64", () => {
    const url = "https://sub.example.com:8000/sub/abc";
    expect(shadowrocketImport(url)).toBe(`shadowrocket://add/sub://${btoa(url)}?remark=${encodeURIComponent(IMPORT_NAME)}`);
  });

  it("三个客户端导入后订阅都叫 importName（没配就用品牌名）", () => {
    const url = "https://sub.example.com:8000/sub/abc";
    expect(IMPORT_NAME).toBeTruthy();
    for (const link of [shadowrocketImport(url), clashVergeImport(url), hiddifyImport(url)]) expect(link).toContain(encodeURIComponent(IMPORT_NAME));
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
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("mac");
  });
});
