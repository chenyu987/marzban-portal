// 防机器人的次数限制：同一个 IP（或账号）在一段时间里做某件事超过几次，就暂时不让做。
// 不另建表，借用 login_failures（本来就是记「谁什么时候试过」的）：email 一栏写「事情:IP 或客人 id」，比如 register:<IP>，
// ip 一栏写 "-"，这样不会被算进客人登录的「同一 IP 错 20 次」里。客人邮箱里没有冒号，后台登录用的是 admin: 开头，不会撞上
import { db, nowSec } from "./env";

export type Limit = { window: number; max: number };

const HOUR = 3600;
const DAY = 24 * HOUR;
// 同一个 IP：每小时最多注册 3 个、每天 10 个；家里或公司几个人共用一个出口 IP 也够用
export const REGISTER_LIMITS: Limit[] = [{ window: HOUR, max: 3 }, { window: DAY, max: 10 }];
// 同一个 IP 申请重置密码：每小时 5 次、每天 20 次，免得有人拿它刷我们的发信额度
export const RESET_IP_LIMITS: Limit[] = [{ window: HOUR, max: 5 }, { window: DAY, max: 20 }];
// 同一个客人兑换码输错：每小时 10 次
export const REDEEM_FAIL_LIMITS: Limit[] = [{ window: HOUR, max: 10 }];

// 纯计算：这些时间点里，有没有哪个时间窗已经满了（再做一次就超）
export function isOverLimit(times: number[], now: number, limits: Limit[]): boolean {
  return limits.some((l) => times.filter((t) => t > now - l.window).length >= l.max);
}

// 本地开发没有 cf-connecting-ip，IP 是 "local"：不限，不然 e2e 一会儿就注册不了了
const skip = (key: string) => key === "local";

export async function overLimit(bucket: string, key: string, limits: Limit[]): Promise<boolean> {
  if (skip(key)) return false;
  const now = nowSec();
  const longest = Math.max(...limits.map((l) => l.window));
  const { results } = await db()
    .prepare("SELECT at FROM login_failures WHERE email = ? AND at > ?")
    .bind(`${bucket}:${key}`, now - longest)
    .all<{ at: number }>();
  return isOverLimit(results.map((r) => r.at), now, limits);
}

// 记一次。过期的记录由客人登录失败时顺手删（只删一天以前的，见 app/actions.ts 的 login）
export async function recordHit(bucket: string, key: string) {
  if (skip(key)) return;
  await db().prepare("INSERT INTO login_failures (email, ip, at) VALUES (?, '-', ?)").bind(`${bucket}:${key}`, nowSec()).run();
}

// login_failures 里的记录留多久：最长的限制是一天
export const KEEP_SECONDS = DAY;
