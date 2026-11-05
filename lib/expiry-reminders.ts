// 每天跑一次的到期提醒：给打开了「到期提醒」的客人，按套餐在到期前几天和当天发邮件（什么时候发见 lib/expiry-notice.ts）。
// 由 app/api/cron/expiry/route.ts 调用；Cloudflare 的定时触发见 custom-worker.ts
import "server-only";
import { db } from "./env";
import { getUser } from "./marzban";
import { canSendMail, sendMail } from "./mail";
import { findPlan } from "./plans";
import { daysLeft, dueNotice } from "./expiry-notice";
import { parseLang } from "./i18n";
import { reminderMail } from "./expiry-mail";
import { groupName } from "./plan-text";
import { site } from "@/site.config";

type Row = { marzban_username: string; code: string | null; email: string; lang: string | null; plan_id: string | null };

export async function runExpiryReminders(now: number): Promise<{ checked: number; sent: number; failed: number }> {
  if (!canSendMail()) return { checked: 0, sent: 0, failed: 0 };
  const { results } = await db()
    .prepare(
      `SELECT s.marzban_username, s.code, c.email, c.lang, p.plan_id FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN subscription_plans p ON p.marzban_username = s.marzban_username
       WHERE c.notify_expiry = 1`,
    )
    .all<Row>();

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    let user;
    try {
      user = await getUser(r.marzban_username);
    } catch (e) {
      console.error(`expiry: 查不到 ${r.marzban_username}`, e);
      continue;
    }
    // 管理员停用的、永不到期的不提醒
    if (user.status === "disabled" || user.status === "on_hold" || !user.expire) continue;
    const plan = r.plan_id ? findPlan(site.plans, r.plan_id) : undefined;
    const days = dueNotice(plan, user.expire, now);
    if (days === null) continue;

    // 先占位再发：两次触发同时跑也只发一封；发失败删掉占位，明天再试
    const claim = await db()
      .prepare("INSERT OR IGNORE INTO expiry_notices (marzban_username, expire, days, sent_at) VALUES (?, ?, ?, ?)")
      .bind(r.marzban_username, user.expire, days, now)
      .run();
    if (claim.meta.changes !== 1) continue;
    const mail = reminderMail(r, plan ? groupName(plan.group ?? plan.name, parseLang(r.lang)) : null, user.expire, daysLeft(user.expire, now), now);
    if (await sendMail(r.email, mail.subject, mail.text)) {
      sent++;
    } else {
      failed++;
      await db()
        .prepare("DELETE FROM expiry_notices WHERE marzban_username = ? AND expire = ? AND days = ?")
        .bind(r.marzban_username, user.expire, days)
        .run();
    }
  }
  return { checked: results.length, sent, failed };
}
