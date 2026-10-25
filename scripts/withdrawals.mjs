// 处理客人的提现申请。客人在订阅页申请时已经扣了余额；管理员用支付宝转账给客人后，标成已打款：
//   npm run withdrawals -- list [--all] [--remote]              看等打款的申请（--all 连处理过的最近 20 笔一起看）
//   npm run withdrawals -- paid <编号> [--note 备注] [--remote]    已经转账了，标成已打款
//   npm run withdrawals -- reject <编号> [--note 原因] [--remote]  不给提，余额退回给客人（原因客人能看到）
// 不加 --remote 写本地开发库，加了写线上库
import { parseArgs } from "node:util";
import { formatDate, formatMoney } from "../lib/format.ts";
import { site } from "../site.config.ts";
import { confirmYes, d1 as d1At, fail, q } from "./admin.mjs";

const USAGE = `用法:
  npm run withdrawals -- list [--all] [--remote]
  npm run withdrawals -- paid <编号> [--note 备注] [--remote]
  npm run withdrawals -- reject <编号> [--note 原因] [--remote]`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    remote: { type: "boolean", default: false },
    all: { type: "boolean", default: false },
    note: { type: "string" },
  },
});
const { remote } = values;
const [cmd, idArg] = positionals;
const d1 = (sql) => d1At(remote, sql);
const where = remote ? "【线上库】" : "【本地库】";
const STATUS = { pending: "等打款", paid: "已打款", rejected: "已拒绝", cancelled: "客人取消" };
const money = (fen) => `${site.currency}${formatMoney(fen)}`;
const line = (w) =>
  `  #${w.id}  ${money(w.amount)}  ${STATUS[w.status] ?? w.status}  支付宝 ${w.alipay_account}（${w.alipay_name}）  ${w.email}  ${formatDate(w.created_at)} 申请${w.note ? `  备注：${w.note}` : ""}`;

const SELECT = `SELECT w.*, c.email FROM withdrawals w JOIN customers c ON c.id = w.customer_id`;

if (cmd === "list") {
  const rows = d1(values.all ? `${SELECT} ORDER BY w.id DESC LIMIT 20` : `${SELECT} WHERE w.status = 'pending' ORDER BY w.id`);
  if (rows.length === 0) console.log(`${where}${values.all ? "还没有提现申请" : "没有等打款的提现申请"}`);
  else {
    console.log(`${where}${values.all ? "最近的提现申请" : "等打款的提现申请"}：`);
    for (const w of rows) console.log(line(w));
  }
  process.exit(0);
}

const id = Number(idArg);
if ((cmd !== "paid" && cmd !== "reject") || !Number.isInteger(id) || id < 1) fail(USAGE);
const [w] = d1(`${SELECT} WHERE w.id = ${id}`);
if (!w) fail(`没有提现申请 #${id}`);
console.log(`${where}提现申请：`);
console.log(line(w));
if (w.status !== "pending") fail(`这笔已经是「${STATUS[w.status] ?? w.status}」了`);
const note = values.note ? q(values.note) : "note";

if (cmd === "paid") {
  if (!(await confirmYes(`确认已经用支付宝转了 ${money(w.amount)} 给 ${w.alipay_account}（${w.alipay_name}）？`))) process.exit(0);
  const done = d1(`UPDATE withdrawals SET status = 'paid', processed_at = unixepoch(), note = ${note} WHERE id = ${id} AND status = 'pending' RETURNING id`);
  if (done.length === 0) fail("状态刚变了（客人可能取消了），重新看一下：npm run withdrawals -- list");
  console.log("已标成已打款，客人在订阅页能看到");
} else {
  if (!values.note) console.log("提示：可以加 --note 写原因，客人能看到");
  if (!(await confirmYes(`拒绝这笔提现，把 ${money(w.amount)} 退回客人余额？`))) process.exit(0);
  const done = d1(`UPDATE withdrawals SET status = 'rejected', processed_at = unixepoch(), note = ${note} WHERE id = ${id} AND status = 'pending' RETURNING id`);
  if (done.length === 0) fail("状态刚变了（客人可能取消了），重新看一下：npm run withdrawals -- list");
  d1(`DELETE FROM balance_entries WHERE withdrawal_id = ${id} AND kind = 'withdrawal'`);
  console.log("已拒绝，余额已退回");
}
