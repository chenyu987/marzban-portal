// 到期提醒邮件的标题和正文（纯文字，单独放这里方便测试）。什么时候发见 lib/expiry-notice.ts
import { site } from "@/site.config";
import { formatExpire, formatSubCode } from "./format";
import { makeT, parseLang } from "./i18n";
import { mailBody, mailGreeting, mailSupportLine } from "./mail-text";

export type ReminderRow = { marzban_username: string; code: string | null; lang: string | null };

// days：按北京时间的日期还剩几天（lib/expiry-notice.ts 的 daysLeft），不是档位
export function reminderMail(r: ReminderRow, planName: string | null, expire: number, days: number, now: number) {
  const lang = parseLang(r.lang);
  const t = makeT(lang);
  const sub = formatSubCode(r.code);
  const what = planName ? t(`${planName}（订阅编号 ${sub}）`, `${planName} (subscription ${sub})`) : t(`订阅 ${sub}`, `Subscription ${sub}`);
  const when = formatExpire(expire, lang);
  const link = new URL(`/plans?renew=${encodeURIComponent(r.marzban_username)}`, site.siteUrl).toString();
  const expired = expire <= now;
  const subject = expired
    ? t(`${site.brand} 订阅已到期`, `Your ${site.brand} subscription has expired`)
    : days <= 0
      ? t(`${site.brand} 订阅今天到期`, `Your ${site.brand} subscription expires today`)
      : days === 1
        ? t(`${site.brand} 订阅明天到期`, `Your ${site.brand} subscription expires tomorrow`)
      : t(`${site.brand} 订阅 ${days} 天后到期`, `Your ${site.brand} subscription expires in ${days} days`);
  const head = expired
    ? t(`你的 ${what} 已经在 ${when} 到期了，续费后马上恢复，不用重新导入。`, `Your ${what} expired on ${when}. Renew to restore it right away; no need to import again.`)
    : t(`你的 ${what} 将在 ${when}（北京时间）到期。`, `Your ${what} expires on ${when} (Beijing time).`);
  // 和 lib/plans.ts 的 renewedExpire 一致：没到期从原到期时间往后加，已到期从续费当天算起
  const extend = expired
    ? t("续费后时间从当日算起。", "The new days start from the day you renew.")
    : t("续上的天数接着原来的到期时间往后加，不会浪费。", "The new days are added after your current expiry date, so nothing is wasted.");
  const text = mailBody([
    mailGreeting(t),
    head,
    `${t("续费：", "Renew: ")}${link}\n${extend}`,
    mailSupportLine(t),
    t("不想收到这类提醒，可以在网站「账户」页关掉。", "To stop these reminders, turn them off on the Account page."),
  ]);
  return { subject, text };
}
