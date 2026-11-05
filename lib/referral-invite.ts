// 「复制推荐邀请」：客人一次复制发给朋友的整段话，带推荐链接和从注册到用上的几步，朋友不用再来回问。
// 口径低调：不写能上哪些网站（2026-11-04 去掉了 ChatGPT、Claude、国外网站），也不加联系客服那句，以「一键导入」结尾
// 在浏览器里用，品牌名由调用方从 useSite() 传进来，这里不 import site.config
import type { Lang } from "./i18n";

export function referralInvite(brand: string, link: string, code: string, lang: Lang = "zh"): string {
  if (lang === "en") {
    return [
      `I use ${brand} and recommend you give it a try. Join with my link:`,
      link,
      "",
      "How to start:",
      `1. Open the link above and sign up (my referral code ${code} is filled in for you)`,
      '2. Go to "Buy / Renew", pick a plan, scan to pay, then tap "I\'ve paid" — it activates right away',
      '3. Go to "My subscription", follow the setup guide to install an app, then tap "Import"',
    ].join("\n");
  }
  return [
    `我在用 ${brand}，推荐你也试试。用我的链接注册：`,
    link,
    "",
    "怎么开始：",
    `1. 打开上面的链接注册（推荐码 ${code} 已经自动填好）`,
    "2. 进「购买/续费」选一个套餐，扫码付款后点「我已付款」，马上开通",
    "3. 回「我的订阅」，按「安装教程」装好 App，点「一键导入」就能用",
  ].join("\n");
}
