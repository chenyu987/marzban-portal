import Link from "next/link";
import { getT } from "@/lib/lang";
import CopyButton from "./CopyButton";

// 后台里客人、订阅互相跳转的链接，所有页面统一用这两个，不用自己去搜
// 客人显示微信号（客服最常用，点了进客人页），后面小字是邮箱；两个后面都有复制按钮，方便贴去微信、邮件里
export async function CustomerLink({ id, email, wechat }: { id: number; email: string; wechat?: string | null }) {
  const { t } = await getT();
  const copyEmail = t("复制邮箱", "Copy email");
  const href = `/admin/customers/${id}`;
  if (!wechat)
    return (
      <span className="inline-flex items-center">
        <Link href={href} className="link link-hover">
          {email}
        </Link>
        <CopyButton text={email} label={copyEmail} />
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center">
      <Link href={href} className="link link-hover">
        {wechat}
        <span className="ml-1 text-xs text-base-content/50">{email}</span>
      </Link>
      <CopyButton text={wechat} label={t("复制微信号", "Copy WeChat ID")} />
      <CopyButton text={email} label={copyEmail} />
    </span>
  );
}

// 订阅 = Marzban 上的一个用户，点进去是订阅详情
export function SubLink({ username }: { username: string }) {
  return (
    <Link href={`/admin/users/${encodeURIComponent(username)}`} className="link link-hover font-mono">
      {username}
    </Link>
  );
}
