// 建管理后台的账号，或者给已有的管理员改密码（网页上不能注册管理员）：
//   npm run admin:create -- <邮箱> [--remote]
// 邮箱要和 Cloudflare Access 登录用的一样，并且写进 site.config.ts 的 admin.emails。
// 密码在终端里输入，不显示、不进命令历史；至少 8 位。
// 不加 --remote 写本地开发库，加了写线上库
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { hashPassword } from "../lib/password.ts";
import { site } from "../site.config.ts";
import { confirmYes, d1 as d1At, fail, q } from "./admin.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { remote: { type: "boolean", default: false } },
});
const { remote } = values;
const email = positionals[0]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("用法: npm run admin:create -- <邮箱> [--remote]");

// 终端里输入时不回显；被管道喂进来（自动化测试）时，几行一下子全到，先排队再一行一行取
let rl = null;
const queued = [];
const waiting = [];
function askPassword(prompt) {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
    if (process.stdin.isTTY) rl._writeToOutput = () => {};
    // 终端里跳过空行：查库那几秒里多按的回车会攒着，问密码时被当成空密码
    rl.on("line", (line) => {
      if (process.stdin.isTTY && !line) return;
      waiting.length ? waiting.shift()(line) : queued.push(line);
    });
  }
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    const done = (line) => {
      if (process.stdin.isTTY) process.stdout.write("\n");
      resolve(line);
    };
    queued.length ? done(queued.shift()) : waiting.push(done);
  });
}

const where = remote ? "【线上库】" : "【本地库】";
const [existing] = d1At(remote, `SELECT id FROM admins WHERE email = ${q(email)}`);
if (existing && !(await confirmYes(`${where}管理员 ${email} 已经有了，要改它的密码吗？`))) process.exit(0);
if (remote && !site.admin.emails.map((e) => e.toLowerCase()).includes(email)) {
  console.log(`⚠️ ${email} 还不在 site.config.ts 的 admin.emails 里，加进去并部署之后才能登录后台`);
}

const password = await askPassword("密码（至少 8 位）：");
if (password.length < 8) fail("密码至少 8 位");
if ((await askPassword("再输一次：")) !== password) fail("两次输入的不一样");
rl.close();

const hash = await hashPassword(password);
if (existing) {
  // 改密码时顺便让这个管理员所有已登录的会话失效
  d1At(remote, `UPDATE admins SET password_hash = ${q(hash)} WHERE id = ${existing.id}`);
  d1At(remote, `DELETE FROM admin_sessions WHERE admin_id = ${existing.id}`);
  console.log(`${where}已改好 ${email} 的密码，原来登录着的都退出了`);
} else {
  d1At(remote, `INSERT INTO admins (email, password_hash, created_at) VALUES (${q(email)}, ${q(hash)}, unixepoch())`);
  console.log(`${where}已建好管理员 ${email}`);
}
