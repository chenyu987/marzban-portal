// 记一笔客人的付款。客人线下付了钱（转账、兑换码以外的方式）时由管理员运行：
//   npm run payment:record -- <客人邮箱> <金额（元）> [--note 备注] [--remote]
// 不加 --remote 写本地开发库，加了写线上库。付款记下后，数据库触发器会自动给推荐人记 10% 的奖励。
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { formatMoney, parseYuan } from "../lib/format.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { remote: { type: "boolean", default: false }, note: { type: "string", default: "" } },
});
const { remote, note } = values;
const [email, yuan] = positionals;

const amount = parseYuan(yuan ?? "");
if (!email || amount === null) {
  console.error("用法: npm run payment:record -- <客人邮箱> <金额（元）> [--note 备注] [--remote]");
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "DB", remote ? "--remote" : "--local", "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return JSON.parse(out)[0].results;
}

const [c] = d1(`
  SELECT c.id, c.email, r.email AS referrer
  FROM customers c LEFT JOIN customers r ON r.id = c.referred_by
  WHERE c.email = ${q(email.trim().toLowerCase())}`);
if (!c) {
  console.error(`没有找到客人 ${email}`);
  process.exit(1);
}

const reward = Math.floor((amount * 10) / 100);
console.log(`${remote ? "【线上库】" : "【本地库】"}给 ${c.email} 记一笔付款 ${formatMoney(amount)} 元${note ? `（${note}）` : ""}`);
console.log(c.referrer && reward > 0 ? `推荐人 ${c.referrer} 会拿到 ${formatMoney(reward)} 元奖励` : "这位客人没有推荐人，不发奖励");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const yes = (await rl.question("确认记账？输入 yes 继续：")).trim() === "yes";
rl.close();
if (!yes) {
  console.log("已取消");
  process.exit(0);
}

const [order] = d1(`
  INSERT INTO orders (customer_id, amount, method, status, note, paid_at, created_at)
  VALUES (${c.id}, ${amount}, 'manual', 'paid', ${q(note)}, unixepoch(), unixepoch())
  RETURNING id`);
console.log(`已记账，订单号 ${order.id}`);
