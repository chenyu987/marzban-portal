// 到期提醒邮件什么时候发。纯函数，有单元测试（expiry-notice.test.ts）
import type { Plan } from "../site.config.example";

const DAY = 86400;
// 到期超过这么久还没续的不再提醒（第一次上线时不给早就到期的老订阅补发）
const EXPIRED_GRACE = 2 * DAY;

// 北京时间的第几天。不能直接 (expire - now) / DAY 往下取整：明早 8 点到期、今早 10 点跑会算成「今天到期」
const bjDay = (t: number) => Math.floor((t + 8 * 3600) / DAY);

// 按北京时间的日期还剩几天到期（0 = 今天，负数 = 已经过了那天）。邮件标题用它，不用档位：明天到期但落在 2 天那档时要写「明天」
export function daysLeft(expire: number, now: number): number {
  return bjDay(expire) - bjDay(now);
}

// 提前几天发（按北京时间的日期算）。0 是最后一封：离到期不到 24 小时就发，不按日期，
// 否则早上 10 点前到期的（比如 9:00）前一天按日期还剩 1 天、没有档，当天 10 点跑时已经断了。
// 免费体验 1 天和最后一封；月付（和不知道套餐的老订阅）2 天和最后一封；季付、半年、一年 7 天、2 天和最后一封
export function noticeDays(plan: Plan | undefined): number[] {
  if (plan && plan.price === 0) return [1, 0];
  if (!plan || plan.days <= 31) return [2, 0];
  return [7, 2, 0];
}

// 现在该发哪一封：剩余天数（北京时间的日期相减，11/07 跑、11/08 到期算 1 天）落到哪一档就发哪一档，只发最近的一档，
// 错过的更早一档（比如上线时已经只剩 3 天，7 天那封）不补发。不该发返回 null
export function dueNotice(plan: Plan | undefined, expire: number | null, now: number): number | null {
  if (!expire || expire < now - EXPIRED_GRACE) return null;
  if (expire - now < DAY) return 0;
  const left = daysLeft(expire, now);
  const due = noticeDays(plan).filter((d) => d > 0 && left <= d);
  return due.length ? Math.min(...due) : null;
}
