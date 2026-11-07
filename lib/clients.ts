// 各客户端的一键导入链接，前后端都能用。格式都还没在真机上验证过。
// 这个文件会进浏览器的 JS，不要 import site.config（会把整个配置打包进去）；要用站点信息就当参数传进来。
// name：导入后客户端里这条订阅叫什么（site.importName，没配就用品牌名）

// Shadowrocket：shadowrocket://add/sub://<订阅链接的 base64>?remark=<名字>
export function shadowrocketImport(url: string, name: string): string {
  return `shadowrocket://add/sub://${btoa(url)}?remark=${encodeURIComponent(name)}`;
}

// Shadowrocket 扫码：sub://<订阅链接的 base64>#<名字>。扫裸订阅链接会拿域名当名字。
// 2026-11-03 真机验证过；在订阅链接后面直接加 #名字 不行（名字有了，链接坏了）。Hiddify 不认这个格式，它扫 hiddifyImport 的链接
export function shadowrocketQr(url: string, name: string): string {
  return `sub://${btoa(url)}#${encodeURIComponent(name)}`;
}

// 续期后订阅链接不变，不刷新节点也照样能连（Marzban 到期时订阅照样下发同样的节点）；客户端里显示的到期时间要刷新订阅才更新
export const RENEW_REFRESH_HINT = {
  zh: "已经导入过的不用重新导入，打开客户端点击刷新按钮，到期时间就会更新",
  en: "No need to import again: open your app and tap the refresh button to see the new expiry date",
};

// Clash Verge Rev 注册了 clash:// 协议
export function clashVergeImport(url: string, name: string): string {
  return `clash://install-config?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
}

// Hiddify：hiddify://import/<订阅链接>#<名字>。也拿来生成给 Hiddify 扫的二维码（2026-11-03 真机验证过）
export function hiddifyImport(url: string, name: string): string {
  return `hiddify://import/${url}#${encodeURIComponent(name)}`;
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


export type Platform = "ios" | "mac" | "windows" | "android";

// 订阅页上那个大的「一键导入」按钮给哪个 App：和安装教程一致，iPhone 用 Shadowrocket，Mac 和 Windows 用 Clash Verge，
// 安卓用 Hiddify。看不出是什么设备（比如 Linux）就给 Shadowrocket（大部分客人用 iPhone）
export type ImportApp = "shadowrocket" | "clash" | "hiddify";
export function primaryApp(platform: Platform | null): ImportApp {
  if (platform === "mac" || platform === "windows") return "clash";
  if (platform === "android") return "hiddify";
  return "shadowrocket";
}

export function detectPlatform(ua: string): Platform | null {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh/.test(ua)) return "mac";
  return null;
}
