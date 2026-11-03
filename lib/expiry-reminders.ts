// 每天跑一次的到期提醒：给打开了「到期提醒」的客人，按套餐在到期前几天和当天发邮件（什么时候发见 lib/expiry-notice.ts）。
// 由 app/api/cron/expiry/route.ts 调用；Cloudflare 的定时触发见 custom-worker.ts
import "server-only";
import { db } from "./env";
import { getUser } from "./marzban";
import { canSendMail, sendMail } from "./mail";
import { findPlan } from "./plans";
import { dueNotice } from "./expiry-notice";
import { formatExpire, formatSubCode } from "./format";
import { makeT, parseLang } from "./i18n";
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
    const mail = reminderMail(r, plan ? groupName(plan.group ?? plan.name, parseLang(r.lang)) : null, user.expire, days, now);
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

function reminderMail(r: Row, planName: string | null, expire: number, days: number, now: number) {
  const lang = parseLang(r.lang);
  const t = makeT(lang);
  const sub = formatSubCode(r.code);
  const what = planName ? t(`${planName}（订阅编号 ${sub}）`, `${planName} (subscription ${sub})`) : t(`订阅 ${sub}`, `Subscription ${sub}`);
  const when = formatExpire(expire, lang);
  const link = new URL(`/plans?renew=${encodeURIComponent(r.marzban_username)}`, site.siteUrl).toString();
  const expired = expire <= now;
  const subject = expired
    ? t(`${site.brand} 订阅已到期`, `Your ${site.brand} subscription has expired`)
    : days === 0
      ? t(`${site.brand} 订阅今天到期`, `Your ${site.brand} subscription expires today`)
      : t(`${site.brand} 订阅 ${days} 天后到期`, `Your ${site.brand} subscription expires in ${days} days`);
  const head = expired
    ? t(`你的 ${what} 已经在 ${when} 到期了，续费后马上恢复，不用重新导入。`, `Your ${what} expired on ${when}. Renew to restore it right away; no need to import again.`)
    : t(`你的 ${what} 将在 ${when}（北京时间）到期。`, `Your ${what} expires on ${when} (Beijing time).`);
  const text = t(
    `你好，\n\n${head}\n\n续费：${link}\n续上的天数接着原来的到期时间往后加，不会浪费。\n\n不想收到这类提醒，可以在网站「账户」页关掉。`,
    `Hi,\n\n${head}\n\nRenew: ${link}\nThe new days are added after your current expiry date, so nothing is wasted.\n\nTo stop these reminders, turn them off on the Account page.`,
  );
  return { subject, text };
}
