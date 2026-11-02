// 记一笔客人的付款。客人线下付了钱（转账、兑换码以外的方式）时由管理员运行：
//   npm run payment:record -- <客人邮箱> <金额（元）> [--note 备注] [--remote]
//   npm run payment:record -- <客人邮箱> [金额（元）] --plan <套餐> [--renew <用户名> | --new] [--note 备注] [--remote]
// 不加 --remote 写本地开发库、连假 Marzban；加了写线上库、连线上 Marzban。
// 带 --plan 时先在 Marzban 开通或续期，再记账；金额不写就按套餐价。
// 付款记下后，数据库触发器会自动给推荐人记 10% 的奖励。
// 客人在套餐页下了单的，用 npm run orders -- confirm <订单号> 确认，不用这个脚本。
import { parseArgs } from "node:util";
import { formatBytes, formatExpire, formatMoney, parseYuan } from "../lib/format.ts";
import { findPlan, newUserBody, nextUsername, renewUserBody } from "../lib/plans.ts";
import { provisionNew, provisionRenew } from "../lib/provision.ts";
import { site } from "../site.config.ts";
import { confirmYes, d1 as d1At, describeUser, fail, marzban, q } from "./admin.mjs";

const USAGE = `用法:
  只记账:        npm run payment:record -- <客人邮箱> <金额（元）> [--note 备注] [--remote]
  记账并开通/续期: npm run payment:record -- <客人邮箱> [金额（元）] --plan <套餐> [--renew <用户名> | --new] [--note 备注] [--remote]`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    remote: { type: "boolean", default: false },
    note: { type: "string", default: "" },
    plan: { type: "string" },
    renew: { type: "string" },
    new: { type: "boolean", default: false },
  },
});
const { remote, note } = values;
const [email, yuan] = positionals;

const plan = values.plan === undefined ? null : findPlan(site.plans, values.plan);
if (values.plan !== undefined && !plan) {
  fail(
    site.plans.length
      ? `没有套餐 ${values.plan}。可选：${site.plans.map((p) => `${p.id}（${p.name}）`).join("、")}`
      : "site.config.ts 里还没有配置套餐（plans），先把套餐填进去",
  );
}
if (!plan && (values.renew || values.new)) fail(`--renew、--new 要和 --plan 一起用\n${USAGE}`);
if (values.renew && values.new) fail("--renew 和 --new 只能选一个");

const amount = yuan === undefined && plan ? plan.price : parseYuan(yuan ?? "");
if (!email || amount === null) fail(USAGE);

const d1 = (sql) => d1At(remote, sql);

// ---- 查客人 ----
const [c] = d1(`
  SELECT c.id, c.email, c.wechat, r.email AS referrer
  FROM customers c LEFT JOIN customers r ON r.id = c.referred_by
  WHERE c.email = ${q(email.trim().toLowerCase())}`);
if (!c) fail(`没有找到客人 ${email}`);

// ---- 决定在 Marzban 上做什么 ----
let mz = null;
let action = null; // { kind: "new" | "renew", username, current? }
if (plan) {
  mz = marzban(remote);
  const subs = d1(`SELECT marzban_username FROM subscriptions WHERE customer_id = ${c.id} ORDER BY id`).map(
    (r) => r.marzban_username,
  );
  if (values.renew) {
    if (!subs.includes(values.renew)) {
      fail(`${values.renew} 不是 ${c.email} 名下的订阅。名下有：${subs.join("、") || "（没有）"}`);
    }
    const current = await mz.getUser(values.renew);
    if (!current) fail(`Marzban 上找不到用户 ${values.renew}`);
    if (!current.expire) fail(`${values.renew} 永不到期，不用续期。只想记账就去掉 --plan`);
    action = { kind: "renew", username: values.renew, current };
  } else if (values.new || subs.length === 0) {
    let username = nextUsername(c.id, subs, c.wechat);
    // 万一 Marzban 上已经有同名用户（比如之前手动建过），序号往后挪
    while (await mz.getUser(username)) username = nextUsername(c.id, [...subs, username], c.wechat);
    action = { kind: "new", username };
  } else {
    fail(`${c.email} 名下已经有订阅：${subs.join("、")}\n续期加 --renew <用户名>，再开一个新的加 --new`);
  }
}

// ---- 确认 ----
const now = Math.floor(Date.now() / 1000);
const reward = Math.floor((amount * 10) / 100);
console.log(`${remote ? "【线上库】" : "【本地库】"}给 ${c.email} 记一笔付款 ${formatMoney(amount)} 元${note ? `（${note}）` : ""}`);
if (plan) {
  console.log(`套餐：${plan.name}（${plan.id}），${plan.days} 天，${plan.dataGB === null ? "不限流量" : `${plan.dataGB} GB`}，${plan.ip ? `${plan.ip} 个 IP` : "不限 IP"}，标价 ${formatMoney(plan.price)} 元`);
  if (amount !== plan.price) console.log("⚠️ 金额和套餐标价不一样，推荐奖励按记账金额算");
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
}
console.log(c.referrer && reward > 0 ? `推荐人 ${c.referrer} 会拿到 ${formatMoney(reward)} 元奖励` : "这位客人没有推荐人，不发奖励");

if (!(await confirmYes(plan ? "确认开通并记账？" : "确认记账？"))) {
  console.log("已取消");
  process.exit(0);
}

// ---- 先改 Marzban，成功了再记账 ----
// 出错时由 lib/provision.ts 判断 Marzban 到底改没改，和网页兑换码用同一套逻辑
if (action) {
  const result =
    action.kind === "new"
      ? await provisionNew(mz.ops, action.username, plan, now)
      : await provisionRenew(mz.ops, action.current, plan, now);
  if (result.kind === "retry") {
    fail(`❌ Marzban 没有改动，也没有记账，可以直接重跑：${result.reason}`);
  }
  if (result.kind === "stuck") {
    fail(
      `❌ ${result.reason}\n` +
        `Marzban 可能已经改了，也可能没改。先去面板看 ${result.username} 现在的状态，确认之后：\n` +
        `  已经改好了 → 只补记账，不要带 --plan：npm run payment:record -- ${c.email} ${formatMoney(amount)}${remote ? " --remote" : ""}\n` +
        `  确实没改   → 原命令重跑`,
    );
  }
  const u = await mz.getUser(result.username).catch(() => null);
  console.log(`Marzban 已${action.kind === "new" ? "新建" : "续期"} ${result.username}${u ? `：${describeUser(u)}` : ""}`);
  if (result.warning) console.error(`⚠️ ${result.warning}。到面板上手动把 ${result.username} 的流量清零`);
}

try {
  if (action?.kind === "new") {
    d1(`INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (${c.id}, ${q(action.username)}, unixepoch())`);
  }
  const [order] = d1(`
    INSERT INTO orders (customer_id, amount, method, status, note, plan_id, marzban_username, paid_at, created_at)
    VALUES (${c.id}, ${amount}, 'manual', 'paid', ${q(note)}, ${plan ? q(plan.id) : "NULL"},
            ${action ? q(action.username) : "NULL"}, unixepoch(), unixepoch())
    RETURNING id`);
  console.log(`已记账，订单号 ${order.id}${action?.kind === "new" ? `。${action.username} 已绑到 ${c.email} 名下，客人登录就能看到` : ""}`);
} catch (e) {
  console.error(`\n❌ Marzban 那边已经改好了，但写数据库失败：${e.message}`);
  if (action?.kind === "new") console.error(`先手动绑定：客人登录后在订阅页粘贴 ${action.username} 的订阅链接，或者再跑一次插入 subscriptions 的 SQL`);
  console.error(`再补记账（不要带 --plan，否则会再开通一次）：npm run payment:record -- ${c.email} ${formatMoney(amount)}${remote ? " --remote" : ""}`);
  process.exit(1);
}
