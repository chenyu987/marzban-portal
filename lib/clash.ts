// 「下载 Clash 配置文件」用：Marzban 默认模板生成的 Clash 配置是全局模式、没有分流规则，
// 这里改成规则模式，换上教程里那份分流规则（CLASH_RULES），客人不用再自己复制规则。
// 只做文本替换，不引 YAML 库：Marzban 输出的顶层键都顶格写，够用
import { AUTO_GROUP, CLASH_RULES } from "./clients";

// 线上换了自定义模板（找不到默认的自动选择组）就原样返回：规则指向不存在的组，客户端会整份配置报错
export function withRules(config: string): string {
  if (!config.includes(AUTO_GROUP)) return config;
  const lines = config.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let hasMode = false;
  let inRules = false;
  for (const line of lines) {
    // 顶层的 rules: 一直到下一个顶格的键为止（列表项可以顶格写成「- xxx」）都去掉
    if (inRules) {
      if (line === "" || /^[\s#-]/.test(line)) continue;
      inRules = false;
    }
    if (/^rules:/.test(line)) {
      inRules = true;
      continue;
    }
    if (/^mode:/.test(line)) {
      out.push("mode: rule");
      hasMode = true;
      continue;
    }
    out.push(line);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return `${hasMode ? "" : "mode: rule\n"}${out.join("\n")}\n\n${CLASH_RULES}`;
}

// 文件名带中文时浏览器认 filename*；filename 给老浏览器兜底，只留 ASCII
export function attachmentHeader(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
