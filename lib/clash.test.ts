import { describe, expect, it } from "vitest";
import { attachmentHeader, withRules } from "./clash";
import { AUTO_GROUP, CLASH_RULES } from "./clients";

// 照 Marzban 0.8.4 默认模板（app/templates/clash/default.yml）渲染出来的样子
const MARZBAN_DEFAULT = `mode: Global
port: 7890
proxies:
- name: 🚀 🇯🇵 东京
  type: vless
  server: 127.0.0.1
  port: 443
rules: []

proxy-groups:
- name: ${AUTO_GROUP}
  type: url-test
  url: http://www.gstatic.com/generate_204
  interval: 300
  proxies:
  - 🚀 🇯🇵 东京
`;

describe("Clash 配置文件", () => {
  it("全局模式改成规则模式，换上教程里的分流规则", () => {
    const out = withRules(MARZBAN_DEFAULT);
    expect(out).toMatch(/^mode: rule$/m);
    expect(out).not.toContain("Global");
    expect(out).not.toContain("rules: []");
    expect(out.endsWith(CLASH_RULES)).toBe(true);
    expect(out.match(/^rules:/gm)).toHaveLength(1);
    // 节点和分组原样保留
    expect(out).toContain("server: 127.0.0.1");
    expect(out).toContain(`- name: ${AUTO_GROUP}\n  type: url-test`);
  });

  it("原来的规则列表不管缩进还是顶格都整段去掉，后面的键留着", () => {
    const src = `mode: global\nrules:\n- MATCH,${AUTO_GROUP}\n  # 注释\n\nproxy-groups:\n- name: ${AUTO_GROUP}\n`;
    const out = withRules(src);
    expect(out).not.toContain("# 注释");
    expect(out.match(/MATCH,/g)).toHaveLength(1);
    expect(out).toContain("proxy-groups:");
  });

  it("没有 mode 就补上；Windows 换行也认", () => {
    const out = withRules(`proxy-groups:\r\n- name: ${AUTO_GROUP}\r\n`);
    expect(out.startsWith("mode: rule\n")).toBe(true);
    expect(out).not.toContain("\r");
  });

  it("找不到默认的自动选择组（换了模板）就原样返回", () => {
    const custom = "mode: rule\nproxy-groups:\n- name: 自动选择\nrules:\n- MATCH,自动选择\n";
    expect(withRules(custom)).toBe(custom);
  });

  it("下载文件名：中文放 filename*，filename 只有 ASCII", () => {
    expect(attachmentHeader("例子-alice.yaml")).toBe(
      `attachment; filename="__-alice.yaml"; filename*=UTF-8''${encodeURIComponent("例子-alice.yaml")}`,
    );
  });
});
