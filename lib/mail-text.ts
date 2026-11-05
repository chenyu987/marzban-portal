// 发给客人的邮件共用的开头称呼和结尾客服联系方式
import { site } from "@/site.config";
import type { makeT } from "./i18n";

type T = ReturnType<typeof makeT>;

export function mailGreeting(t: T): string {
  const name = site.mailGreetingName ?? site.brand;
  return t(`尊敬的 ${name} 用户：`, `Dear ${name} user,`);
}

// 没配 contactEmail 就不写这句
export function mailSupportLine(t: T): string {
  return site.contactEmail ? t(`有任何疑问，欢迎发邮件给客服：${site.contactEmail}`, `Any questions? Email our support: ${site.contactEmail}`) : "";
}

// 正文段落用空行隔开，空段落跳过
export function mailBody(parts: string[]): string {
  return parts.filter(Boolean).join("\n\n");
}
