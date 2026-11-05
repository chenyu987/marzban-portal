// 「上个月用得最多的那个订阅用了多少」：客人订阅页上不限流量的圆环按它当满圈（本月已用 ÷ 上个月最高）。
// 每天的定时任务调 runUsagePeak，上个月还没算就算一次，存进 usage_peaks。
// 只查当前已用流量最多的 30 个订阅上个月各用了多少：Workers 一次定时任务能发的外部请求有限（免费版 50 个），
// 上个月用得最多的人基本都在这 30 个里面
import { db, nowSec } from "./env";
import { listUsers, userUsage } from "./marzban";
import { monthStartBeijing } from "./admin-users";

const CANDIDATES = 30;

// 北京时间的「2026-10」
export function monthKey(ms: number): string {
  const bj = new Date(ms + 8 * 3600_000);
  return `${bj.getUTCFullYear()}-${String(bj.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 上个月（北京时间）的起止
export function lastMonthRange(nowMs: number): { key: string; start: Date; end: Date } {
  const end = monthStartBeijing(nowMs);
  const start = monthStartBeijing(end.getTime() - 1);
  return { key: monthKey(start.getTime()), start, end };
}

// 圆环画多少：本月已用 ÷ 上个月最高，最多 100%
export function peakRingPct(used: number, peak: number): number {
  if (peak <= 0) return 0;
  return Math.min(100, (Math.max(0, used) / peak) * 100);
}

export async function latestPeak(): Promise<number | null> {
  const r = await db().prepare("SELECT peak FROM usage_peaks WHERE peak > 0 ORDER BY month DESC LIMIT 1").first<{ peak: number }>();
  return r?.peak ?? null;
}

export async function runUsagePeak(nowMs = nowSec() * 1000): Promise<{ month: string; peak: number; username: string | null } | { skipped: string }> {
  const { key, start, end } = lastMonthRange(nowMs);
  if (await db().prepare("SELECT 1 FROM usage_peaks WHERE month = ?").bind(key).first()) return { skipped: key };
  const { users } = await listUsers({ offset: 0, limit: CANDIDATES, sort: "-used_traffic" });
  let peak = 0;
  let who: string | null = null;
  for (const u of users) {
    const used = await userUsage(u.username, start, end)
      .then((r) => r.usages.reduce((n, x) => n + x.used_traffic, 0))
      .catch(() => 0);
    if (used > peak) {
      peak = used;
      who = u.username;
    }
  }
  await db()
    .prepare("INSERT OR REPLACE INTO usage_peaks (month, peak, username, computed_at) VALUES (?, ?, ?, ?)")
    .bind(key, peak, who, Math.floor(nowMs / 1000))
    .run();
  return { month: key, peak, username: who };
}
