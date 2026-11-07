// 注册成功后的两封邮件（纯文字，单独放这里方便测试）：发给客人的欢迎信，和发给管理员的「新客人」提醒。
// 什么时候发见 app/actions.ts 的 register
import { site } from "@/site.config";
import { makeT, type Lang } from "./i18n";
import { mailBody, mailGreeting, mailSupportLine } from "./mail-text";

// claimed：注册时按微信号自动绑过来的老订阅有几个。有的话告诉客人直接去「我的订阅」，不用再买
export function welcomeMail(lang: Lang, email: string, claimed: number) {
  const t = makeT(lang);
  const link = (path: string) => new URL(path, site.siteUrl).toString();
  const subject = t(`欢迎加入 ${site.brand}，注册成功`, `Welcome to ${site.brand}, you're all set`);
  const next = claimed
    ? t(
        `你之前的 ${claimed} 个订阅已经自动关联到这个账号，打开「我的订阅」就能看到：${link("/dashboard")}`,
        `${claimed} existing subscription${claimed === 1 ? " has" : "s have"} been linked to this account. See them under My subscriptions: ${link("/dashboard")}`,
      )
    : t(`下一步：在「购买/续费」选一个套餐，开通后马上能用：${link("/plans")}`, `Next: pick a plan, and it's ready to use as soon as it's active: ${link("/plans")}`);
  const text = mailBody([
    mailGreeting(t),
    t(`你的 ${site.brand} 账号已经注册成功，登录邮箱是 ${email}。`, `Your ${site.brand} account is ready. You sign in with ${email}.`),
    next,
    t(`怎么装 App、怎么导入：${link("/tutorial")}`, `How to install the app and import your subscription: ${link("/tutorial")}`),
    mailSupportLine(t),
    // 邮件带了回复地址（客服邮箱，见 lib/mail.ts），客人直接回复就行
    t("如果这不是你本人注册的，直接回复这封邮件告诉我们。", "If you didn't sign up, just reply to this email and let us know."),
  ]);
  return { subject, text };
}

// 发给管理员（site.contactEmail）。中文就行，管理员自己看
export function newCustomerAlert(c: { email: string; wechat: string; referrer: string | null; claimed: string[] }) {
  const subject = `【新客人】${c.wechat} ${c.email}`;
  const text = mailBody([
    `有新客人注册：\n邮箱：${c.email}\n微信号：${c.wechat}` + (c.referrer ? `\n推荐人：${c.referrer}` : ""),
    c.claimed.length ? `按微信号自动绑上了老订阅：${c.claimed.join("、")}` : "",
    site.admin.url ? `去后台看：${site.admin.url}/admin/customers?q=${encodeURIComponent(c.email)}` : "",
  ]);
  return { subject, text };
}
