// 生成兑换码。客人在套餐页输入后自动开通或续期对应的套餐：
//   npm run codes:create -- <套餐> [数量] [--note 备注] [--remote]
// 不加 --remote 写本地开发库，加了写线上库。生成的兑换码打印出来，发给付了款的客人。
// 查兑换码用没用：npx wrangler d1 execute DB --remote --command "SELECT code, plan_id, used_by, used_at FROM redeem_codes ORDER BY created_at DESC LIMIT 20"
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { formatMoney, formatRedeemCode, newRedeemCode } from "../lib/format.ts";
import { findPlan } from "../lib/plans.ts";
import { site } from "../site.config.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { remote: { type: "boolean", default: false }, note: { type: "string", default: "" } },
});
const { remote, note } = values;
const [planId, countArg = "1"] = positionals;
const count = Number(countArg);

const plan = planId ? findPlan(site.plans, planId) : undefined;
if (!plan || !Number.isInteger(count) || count < 1 || count > 100) {
  console.error("用法: npm run codes:create -- <套餐> [数量，最多 100] [--note 备注] [--remote]");
  if (site.plans.length) console.error(`套餐：${site.plans.map((p) => p.id).join("、")}`);
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const codes = Array.from({ length: count }, newRedeemCode);
const rows = codes.map((c) => `(${q(c)}, ${q(plan.id)}, ${q(note)}, unixepoch())`).join(", ");
execFileSync(
  "npx",
  [
    "wrangler", "d1", "execute", "DB", remote ? "--remote" : "--local", "--json",
    "--command", `INSERT INTO redeem_codes (code, plan_id, note, created_at) VALUES ${rows}`,
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

console.log(`${remote ? "【线上库】" : "【本地库】"}${plan.name}（${site.currency}${formatMoney(plan.price)}）兑换码 ${count} 个${note ? `（${note}）` : ""}：`);
for (const c of codes) console.log(formatRedeemCode(c));
