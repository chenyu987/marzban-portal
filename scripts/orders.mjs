// 处理客人在套餐页下的单。客人下单后转账（转账备注里写订单号），付完在页面上点「我已付款」，系统记下时间。
// 管理员按这个时间和金额去支付宝/微信账单里找这笔钱，找到了就确认：
//   npm run orders -- list [--remote]                    看还没处理完的单。客人说已付的排在前面，带着他点「我已付款」的时间
//   npm run orders -- list <金额> [--remote]               按到账金额找单（客人没写备注时缩小范围），比如 list 45。
//                                                         金额是客人实际要转的钱：用了余额抵扣的单是套餐价减掉抵扣
//   npm run orders -- confirm <订单号> [--remote]          确认收到钱：在 Marzban 开通或续期，再把单记成已付款（触发推荐奖励）
//   npm run orders -- cancel <订单号> [--note 原因] [--remote]  取消一张还没付款的单
// 开通出错、单停在「开通中」时：
//   npm run orders -- confirm <订单号> --done <用户名>      去面板看过，Marzban 已经改好了：只绑定订阅、记成已付款
//   npm run orders -- confirm <订单号> --again             去面板看过，Marzban 确实没改：重新开通
// 客人用余额买套餐时网页直接开通，不经过这里；只有开通出错、停在「开通中」的余额单会出现在 list 里，同样用 --done / --again 处理。
// 不加 --remote 写本地开发库、连假 Marzban；加了写线上库、连线上 Marzban。
import { parseArgs } from "node:util";
import { formatBytes, formatDate, formatExpire, formatMoney, parseYuan } from "../lib/format.ts";
import { findPlan, newUserBody, nextUsername, renewUserBody } from "../lib/plans.ts";
import { provisionNew, provisionRenew } from "../lib/provision.ts";
import { site } from "../site.config.ts";
import { confirmYes, d1 as d1At, describeUser, fail, marzban, q } from "./admin.mjs";

const USAGE = `用法:
  npm run orders -- list [到账金额] [--remote]
  npm run orders -- confirm <订单号> [--done <用户名> | --again] [--remote]
  npm run orders -- cancel <订单号> [--note 原因] [--remote]`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    remote: { type: "boolean", default: false },
    note: { type: "string" },
    done: { type: "string" },
    again: { type: "boolean", default: false },
  },
});
const { remote } = values;
const [cmd, idArg] = positionals;
const d1 = (sql) => d1At(remote, sql);
const where = remote ? "【线上库】" : "【本地库】";
const STATUS = { pending: "等付款", processing: "开通中", paid: "已付款", cancelled: "已取消" };
// 等付款的单再分两种：客人点过「我已付款」的，显示点的时间（对账就按这个时间找）
const statusText = (o) =>
  o.status === "pending" && o.claimed_at
    ? `客人 ${formatExpire(o.claimed_at)} 说已付`
    : `${STATUS[o.status] ?? o.status}${o.method === "balance" ? "（余额付款）" : ""}`;
const planName = (id) => findPlan(site.plans, id)?.name ?? `${id}（已下架）`;
const targetText = (o) => (o.marzban_username ? `续期 ${o.marzban_username}` : "新开订阅");
// 客人还要转账的金额：套餐价减掉下单时用余额抵扣的部分
const dueText = (o) =>
  `${site.currency}${formatMoney(o.amount - o.balance_used)}${o.balance_used > 0 ? `（套餐价 ${formatMoney(o.amount)}，余额抵扣 ${formatMoney(o.balance_used)}）` : ""}`;

if (cmd === "list") {
  // 带金额就按到账金额找，不管单是什么状态（客人可能付完钱又点了取消）
  const amount = idArg === undefined ? null : parseYuan(idArg);
  if (idArg !== undefined && amount === null) fail(`金额格式不对：${idArg}\n${USAGE}`);
  const rows = d1(`
    SELECT o.id, c.email, o.amount, o.balance_used, o.method, o.plan_id, o.marzban_username, o.status, o.claimed_at, o.created_at
    FROM orders o JOIN customers c ON c.id = o.customer_id
    WHERE o.method IN ('transfer', 'balance') AND ${amount === null ? "o.status IN ('pending', 'processing')" : `o.amount - o.balance_used = ${amount}`}
    ORDER BY o.claimed_at IS NULL, o.claimed_at, o.id`);
  if (rows.length === 0) {
    console.log(amount === null ? `${where}没有待处理的单` : `${where}没有金额是 ${site.currency}${formatMoney(amount)} 的单`);
  } else {
    console.log(amount === null ? `${where}待处理的单：` : `${where}金额是 ${site.currency}${formatMoney(amount)} 的单：`);
    for (const o of rows) {
      console.log(
        `  #${o.id}  ${dueText(o)}  ${statusText(o)}  ${o.email}  ${planName(o.plan_id)}  ${targetText(o)}  ${formatDate(o.created_at)} 下单`,
      );
    }
  }
  process.exit(0);
}

const id = Number(idArg);
if ((cmd !== "confirm" && cmd !== "cancel") || !Number.isInteger(id) || id < 1) fail(USAGE);

const [o] = d1(`
  SELECT o.*, c.email, c.wechat, r.email AS referrer
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  LEFT JOIN customers r ON r.id = c.referred_by
  WHERE o.id = ${id}`);
if (!o) fail(`没有订单 #${id}`);
console.log(`${where}订单 #${o.id}：${o.email}，${o.plan_id ? planName(o.plan_id) : "（没有套餐）"}，${dueText(o)}，${targetText(o)}，${statusText(o)}`);

if (cmd === "cancel") {
  if (o.status === "processing") fail("这张单正在开通，不能直接取消。先按 confirm 的提示核对 Marzban");
  if (o.status !== "pending") fail(`这张单已经${STATUS[o.status] ?? o.status}了，不用取消`);
  if (o.claimed_at) console.log("⚠️ 客人点过「我已付款」。先去账单里确认这笔钱确实没到再取消");
  if (!(await confirmYes("确认取消？"))) process.exit(0);
  const done = d1(`
    UPDATE orders SET status = 'cancelled', note = ${values.note ? q(values.note) : "note"}
    WHERE id = ${id} AND status = 'pending' RETURNING id`);
  if (done.length === 0) fail("单的状态刚变了，重新看一下：npm run orders -- list");
  // 下单时抵扣的余额退回
  d1(`DELETE FROM balance_entries WHERE order_id = ${id} AND kind = 'purchase'`);
  console.log(o.balance_used > 0 ? `已取消，抵扣的 ${formatMoney(o.balance_used)} 元余额已退回` : "已取消");
  process.exit(0);
}

// ---- confirm ----
// 余额单正常情况下网页已经开通好了，只有停在「开通中」的才需要这里处理
if (o.method !== "transfer" && !(o.method === "balance" && o.status === "processing")) fail("这不是要在这里处理的单");
if (o.status === "paid") fail("这张单已经确认过了");
if (o.status === "cancelled") {
  fail(`这张单已经取消了。客人如果确实付了这笔钱，用 npm run payment:record -- ${o.email} --plan ${o.plan_id}${remote ? " --remote" : ""} 开通并记账`);
}
if (o.status === "processing" && !values.done && !values.again) {
  fail(
    `这张单上次开通时出了问题，停在「开通中」。先去面板看一下，然后：\n` +
      `  Marzban 已经改好了 → npm run orders -- confirm ${id} --done <用户名>${remote ? " --remote" : ""}\n` +
      `  Marzban 确实没改   → npm run orders -- confirm ${id} --again${remote ? " --remote" : ""}`,
  );
}
if (o.status === "pending" && (values.done || values.again)) fail("--done、--again 只用在停在「开通中」的单上");

const plan = findPlan(site.plans, o.plan_id);
if (!plan) fail(`套餐 ${o.plan_id} 已经不在 site.config.ts 里了。要么先把它加回去，要么取消这张单，用 payment:record 按别的套餐开通`);

const subs = d1(`SELECT marzban_username FROM subscriptions WHERE customer_id = ${o.customer_id} ORDER BY id`).map(
  (r) => r.marzban_username,
);
if (o.marzban_username && !subs.includes(o.marzban_username)) {
  fail(`要续期的 ${o.marzban_username} 已经不在 ${o.email} 名下了。取消这张单，用 payment:record 处理`);
}
const reward = Math.floor((o.amount * 10) / 100);
const rewardText = o.referrer && reward > 0 ? `推荐人 ${o.referrer} 会拿到 ${formatMoney(reward)} 元奖励` : "这位客人没有推荐人，不发奖励";

// 把单记成已付款（触发推荐奖励）。新开的先把订阅绑到客人名下
function markPaid(username, isNew) {
  try {
    if (isNew && !subs.includes(username)) {
      d1(`INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (${o.customer_id}, ${q(username)}, unixepoch())`);
    }
    d1(`UPDATE orders SET status = 'paid', paid_at = unixepoch(), marzban_username = ${q(username)} WHERE id = ${id}`);
  } catch (e) {
    fail(
      `\n❌ Marzban 那边已经改好了，但写数据库失败：${e.message}\n` +
        `单还停在「开通中」，修好之后运行：npm run orders -- confirm ${id} --done ${username}${remote ? " --remote" : ""}`,
    );
  }
  console.log(`已确认，订单 #${id} 记成已付款${isNew ? `。${username} 已绑到 ${o.email} 名下，客人登录就能看到` : ""}。${rewardText}`);
}

const mz = marzban(remote);

// Marzban 已经改好了，只补绑定和记账
if (values.done) {
  const username = values.done;
  if (o.marzban_username && username !== o.marzban_username) fail(`这张单是给 ${o.marzban_username} 续期的，--done 后面要写 ${o.marzban_username}`);
  const u = await mz.getUser(username);
  if (!u) fail(`Marzban 上找不到用户 ${username}`);
  console.log(`Marzban 上 ${username} 现在：${describeUser(u)}`);
  if (!(await confirmYes(`确认 ${username} 已经按 ${plan.name} 开通好了，只记账不再改 Marzban？`))) process.exit(0);
  markPaid(username, !o.marzban_username);
  process.exit(0);
}

// 决定在 Marzban 上做什么
let action; // { kind: "new" | "renew", username, current? }
if (o.marzban_username) {
  const current = await mz.getUser(o.marzban_username);
  if (!current) fail(`Marzban 上找不到用户 ${o.marzban_username}`);
  if (!current.expire) fail(`${o.marzban_username} 永不到期，不用续期。取消这张单，和客人确认要不要新开`);
  action = { kind: "renew", username: o.marzban_username, current };
} else {
  let username = nextUsername(o.customer_id, subs, o.wechat);
  // 万一 Marzban 上已经有同名用户（比如之前手动建过），序号往后挪
  // 库里还绑着（Marzban 上被手动删了）也算占用，不然写绑定时撞唯一约束
  const bound = (name) => d1(`SELECT 1 FROM subscriptions WHERE marzban_username = ${q(name)}`).length > 0;
  while (bound(username) || (await mz.getUser(username))) username = nextUsername(o.customer_id, [...subs, username], o.wechat);
  action = { kind: "new", username };
}

const now = Math.floor(Date.now() / 1000);
console.log(`套餐：${plan.name}（${plan.id}），${plan.days} 天，${plan.dataGB === null ? "不限流量" : `${plan.dataGB} GB`}，${plan.ip ? `${plan.ip} 个 IP` : "不限 IP"}`);
console.log(`Marzban（${mz.url}）：`);
if (action.kind === "new") {
  const b = newUserBody(action.username, plan, now);
  console.log(`  新建用户 ${action.username}，到期 ${formatExpire(b.expire)}，备注 ${b.note}`);
} else {
  const b = renewUserBody(action.current, plan, now);
  console.log(`  续期 ${action.username}`);
  console.log(`  现在：${describeUser(action.current)}`);
  console.log(`  续期后：到期 ${formatExpire(b.expire)}，流量清零，上限 ${b.data_limit ? formatBytes(b.data_limit) : "不限"}，备注 ${b.note}`);
}
console.log(rewardText);
if (o.method === "transfer" && !o.claimed_at) console.log("⚠️ 客人还没点「我已付款」。确认账单里确实有这笔钱再继续");
if (!(await confirmYes(`确认已经收到 ${site.currency}${formatMoney(o.amount - o.balance_used)}${o.claimed_at ? `（客人 ${formatExpire(o.claimed_at)} 说已付）` : ""}，开通并记账？`))) {
  console.log("已取消，单没有动");
  process.exit(0);
}

// 先把单占成「开通中」：防止同一张单被确认两次，也防止客人这时候取消
const claimed = d1(`
  UPDATE orders SET status = 'processing'
  WHERE id = ${id} AND status = ${q(o.status)} RETURNING id`);
if (claimed.length === 0) fail("单的状态刚变了（客人可能取消了），重新看一下：npm run orders -- list");

// 出错时由 lib/provision.ts 判断 Marzban 到底改没改，和网页兑换码用同一套逻辑
const result =
  action.kind === "new"
    ? await provisionNew(mz.ops, action.username, plan, now)
    : await provisionRenew(mz.ops, action.current, plan, now);
if (result.kind === "retry") {
  d1(`UPDATE orders SET status = 'pending' WHERE id = ${id} AND status = 'processing'`);
  fail(`❌ Marzban 没有改动，单退回「等付款」，可以直接重跑：${result.reason}`);
}
if (result.kind === "stuck") {
  fail(
    `❌ ${result.reason}\n` +
      `Marzban 可能已经改了，也可能没改，单停在「开通中」。先去面板看 ${result.username} 现在的状态，确认之后：\n` +
      `  已经改好了 → npm run orders -- confirm ${id} --done ${result.username}${remote ? " --remote" : ""}\n` +
      `  确实没改   → npm run orders -- confirm ${id} --again${remote ? " --remote" : ""}`,
  );
}
const u = await mz.getUser(result.username).catch(() => null);
console.log(`Marzban 已${action.kind === "new" ? "新建" : "续期"} ${result.username}${u ? `：${describeUser(u)}` : ""}`);
if (result.warning) console.error(`⚠️ ${result.warning}。到面板上手动把 ${result.username} 的流量清零`);
markPaid(result.username, action.kind === "new");
