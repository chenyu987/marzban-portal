// 重置密码链接的 token：随机生成，数据库里只存 SHA-256。网页和命令行脚本（scripts/reset-link.mjs）共用
// 带 .ts 后缀引用：命令行脚本用 node 直接跑这个文件

// 客人自己在网页上申请的链接 1 小时内有效；管理员生成、微信发给客人的给 24 小时，免得客人没及时看到
export const RESET_TTL_SELF = 60 * 60;
export const RESET_TTL_ADMIN = 24 * 60 * 60;
// 同一个账号 1 小时内最多申请几次，防止有人拿别人的邮箱刷邮件
export const RESET_MAX_PER_HOUR = 3;

export function newResetToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashResetToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 链接永远用配置里的站点地址拼，不用请求里的 Host：否则有人伪造 Host，发出去的链接就指向他的网站
export function resetLink(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/reset?token=${token}`;
}
