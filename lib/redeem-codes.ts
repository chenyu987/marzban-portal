// 兑换码的天数和发给客人的话术。后台生成时可以在套餐默认天数上加减（比如 7 天体验改成 10 天），
// 天数记在 redeem_codes.days，空表示按套餐的天数
import type { Plan } from "../site.config.example";
import { formatRedeemCode } from "./format";

export const MAX_CODE_DAYS = 3650;

// 后台填的天数：空或等于套餐天数 → null（按套餐）；不是 1～3650 的整数 → 报错
export function parseCodeDays(input: string, plan: Plan): { days: number | null } | { error: string } {
  const s = input.trim();
  if (!s) return { days: null };
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > MAX_CODE_DAYS) return { error: `天数要写 1 到 ${MAX_CODE_DAYS} 的整数` };
  return { days: n === plan.days ? null : n };
}

// 兑换码单独定了天数时，开通 / 续期按这个天数算；体验的名字里的天数跟着改（「高速版 7天体验」→「高速版 10天体验」）
export function withCodeDays(plan: Plan, days: number | null | undefined): Plan {
  if (!days || days === plan.days) return plan;
  return {
    ...plan,
    days,
    name: /\d+天体验/.test(plan.name) ? plan.name.replace(/\d+天体验/, `${days}天体验`) : `${plan.name}（${days} 天）`,
    en: plan.en && (/\d+-day trial/.test(plan.en) ? plan.en.replace(/\d+-day trial/, `${days}-day trial`) : `${plan.en} (${days} days)`),
  };
}

// 生成后给管理员两段直接复制发给客人的话：短的只有兑换码；长的带怎么用
export function codeMessages(codes: string[], plan: Plan, brand: string, siteUrl: string): { short: string; long: string } {
  const list = codes.map(formatRedeemCode);
  const one = list.length === 1;
  const short = one ? `兑换码：${list[0]}` : `兑换码（${list.length} 个）：\n${list.join("\n")}`;
  const long = [
    // 名字里已经有天数（「高速版 10天体验」「月付（35 天）」）就不再写一遍
    `${brand} ${plan.name}${plan.name.includes("天") ? "" : `（${plan.days} 天）`} 兑换码${one ? "" : `（${list.length} 个，每个只能用一次）`}：`,
    ...list,
    "",
    "用法：",
    `1. 打开 ${siteUrl}/register 注册（已经有账号就直接登录）`,
    "2. 进「购买/续费」，在最下面「输入兑换码」粘贴，点兑换就开通了",
    "3. 回「我的订阅」，按「安装教程」装好 App，点「一键导入」就能用",
    "",
    "兑换码只能用一次，别转给别人。",
  ].join("\n");
  return { short, long };
}
