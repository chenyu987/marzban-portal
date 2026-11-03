// 到期提醒邮件什么时候发。纯函数，有单元测试（expiry-notice.test.ts）
import type { Plan } from "../site.config.example";

const DAY = 86400;
// 到期超过这么久还没续的不再提醒（第一次上线时不给早就到期的老订阅补发）
const EXPIRED_GRACE = 2 * DAY;

// 提前几天发（0 = 到期当天）：免费体验 1 天和当天；月付（和不知道套餐的老订阅）3 天和当天；季付、半年、一年 7 天、3 天和当天
export function noticeDays(plan: Plan | undefined): number[] {
  if (plan && plan.price === 0) return [1, 0];
  if (!plan || plan.days <= 31) return [3, 0];
  return [7, 3, 0];
}

// 现在该发哪一封：剩余天数（往下取整）落到哪一档就发哪一档，只发最近的一档，
// 错过的更早一档（比如上线时已经只剩 3 天，7 天那封）不补发。不该发返回 null
export function dueNotice(plan: Plan | undefined, expire: number | null, now: number): number | null {
  if (!expire || expire < now - EXPIRED_GRACE) return null;
  const daysLeft = Math.floor((expire - now) / DAY);
  const due = noticeDays(plan).filter((d) => daysLeft <= d);
  return due.length ? Math.min(...due) : null;
}
