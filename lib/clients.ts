// 各客户端的一键导入链接，前后端都能用。格式都还没在真机上验证过
import { site } from "@/site.config";

export const BRAND = site.brand;
// 一键导入后客户端里订阅的名字
export const IMPORT_NAME = site.importName ?? site.brand;
// 客服联系方式，「复制客服微信」「复制客服邮箱」按钮用
export const SUPPORT = { wechat: site.supportWechat, email: site.contactEmail };

// Shadowrocket：shadowrocket://add/sub://<订阅链接的 base64>?remark=<名字>
export function shadowrocketImport(url: string): string {
  return `shadowrocket://add/sub://${btoa(url)}?remark=${encodeURIComponent(IMPORT_NAME)}`;
}

// 续期后订阅链接不变，节点照样能连；客户端里显示的到期时间要刷新订阅才更新，之前过期连不上的也是刷新一下就好
export const RENEW_REFRESH_HINT = "已经导入过的不用重新导入，打开 VPN 软件刷新（更新）一下订阅，到期时间就会更新";

// Clash Verge Rev 注册了 clash:// 协议
export function clashVergeImport(url: string): string {
  return `clash://install-config?url=${encodeURIComponent(url)}&name=${encodeURIComponent(IMPORT_NAME)}`;
}

// Hiddify：hiddify://import/<订阅链接>#<名字>
export function hiddifyImport(url: string): string {
  return `hiddify://import/${url}#${encodeURIComponent(IMPORT_NAME)}`;
}

// Clash Verge「扩展覆写配置」里填的分流规则：OpenAI、Claude 和国外流量走自动选节点，局域网和国内直连。
// 组名必须和 Marzban 默认 Clash 模板（app/templates/clash/default.yml）里的一字不差，
// 注意 ♻ 后面有一个看不见的 U+FE0F。线上如果换了自定义模板，这里要跟着改
export const AUTO_GROUP = "♻️ Automatic";

export const CLASH_RULES = `rules:
  - DOMAIN-SUFFIX,openai.com,${AUTO_GROUP}
  - DOMAIN-SUFFIX,chatgpt.com,${AUTO_GROUP}
  - DOMAIN-SUFFIX,oaistatic.com,${AUTO_GROUP}
  - DOMAIN-SUFFIX,oaiusercontent.com,${AUTO_GROUP}
  - DOMAIN-SUFFIX,anthropic.com,${AUTO_GROUP}
  - DOMAIN-SUFFIX,claude.ai,${AUTO_GROUP}
  - DOMAIN-SUFFIX,claude.com,${AUTO_GROUP}
  - DOMAIN-SUFFIX,claudeusercontent.com,${AUTO_GROUP}
  - IP-CIDR,127.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,172.16.0.0/12,DIRECT,no-resolve
  - IP-CIDR,192.168.0.0/16,DIRECT,no-resolve
  - GEOIP,CN,DIRECT
  - MATCH,${AUTO_GROUP}
`;

export const DOWNLOADS = site.downloads;

export type Platform = "ios" | "mac" | "windows" | "android";

export function detectPlatform(ua: string): Platform | null {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh/.test(ua)) return "mac";
  return null;
}
