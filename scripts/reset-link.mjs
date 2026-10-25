// 给客人生成一个重置密码的链接，管理员用微信之类发给客人。还不能自动发邮件时用这个，能发邮件了也可以用：
//   npm run password:reset-link -- <客人邮箱> [--remote]
// 链接 24 小时内有效，只能用一次。客人用它设好新密码后，所有设备上的登录都会退出。
// 不加 --remote 写本地开发库（链接指向 localhost:3000），加了写线上库（链接指向 site.config.ts 的 siteUrl）。
// 链接等于临时密码：只发给客人本人，确认是本人再发
import { parseArgs } from "node:util";
import { formatExpire } from "../lib/format.ts";
import { hashResetToken, newResetToken, RESET_TTL_ADMIN, resetLink } from "../lib/reset.ts";
import { site } from "../site.config.ts";
import { d1 as d1At, fail, q } from "./admin.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { remote: { type: "boolean", default: false } },
});
const { remote } = values;
const [email] = positionals;
if (!email) fail("用法: npm run password:reset-link -- <客人邮箱> [--remote]");

const [c] = d1At(remote, `SELECT id, email FROM customers WHERE email = ${q(email.trim().toLowerCase())}`);
if (!c) fail(`没有找到客人 ${email}`);

const token = newResetToken();
const now = Math.floor(Date.now() / 1000);
d1At(
  remote,
  `INSERT INTO password_resets (token_hash, customer_id, expires_at, created_at)
   VALUES (${q(await hashResetToken(token))}, ${c.id}, ${now + RESET_TTL_ADMIN}, ${now})`,
);

console.log(`${remote ? "【线上库】" : "【本地库】"}${c.email} 的重置密码链接（${formatExpire(now + RESET_TTL_ADMIN)} 前有效，只能用一次）：`);
console.log(resetLink(remote ? site.siteUrl : "http://localhost:3000", token));
