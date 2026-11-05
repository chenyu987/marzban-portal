import Link from "next/link";
import { getT } from "@/lib/lang";
import CopyButton, { CopyText } from "./CopyButton";

// 后台里客人、订阅互相跳转的链接，所有页面统一用这两个，不用自己去搜
// 客人分两行：上面微信号（客服最常用），下面小字邮箱，各自一行不折行。
// copy = false（默认）：两行都能点进客人页，后面各跟一个复制按钮；
// copy = true：点文字就是复制，不跳转（订阅列表用：这里要的是把微信号、邮箱贴去微信或邮件）
// part：表格里微信号、邮箱分成两列时，每一列只显示其中一样（没填微信号显示「-」）
export async function CustomerLink({
  id,
  email,
  wechat,
  copy = false,
  part,
}: {
  id: number;
  email: string;
  wechat?: string | null;
  copy?: boolean;
  part?: "wechat" | "email";
}) {
  const { t } = await getT();
  const href = `/admin/customers/${id}`;
  const line = (text: string, label: string, small: boolean) => (
    <span className={`inline-flex items-center whitespace-nowrap ${small ? "text-xs text-base-content/60" : ""}`}>
      {copy ? (
        <CopyText text={text} />
      ) : (
        <>
          <Link href={href} className="link link-hover">
            {text}
          </Link>
          <CopyButton text={text} label={label} />
        </>
      )}
    </span>
  );
  if (part === "wechat") return wechat ? line(wechat, t("复制微信号", "Copy WeChat ID"), false) : <span className="text-base-content/40">-</span>;
  if (part === "email") return line(email, t("复制邮箱", "Copy email"), false);
  return (
    <span className="inline-flex flex-col items-start leading-snug">
      {wechat && line(wechat, t("复制微信号", "Copy WeChat ID"), false)}
      {line(email, t("复制邮箱", "Copy email"), !!wechat)}
    </span>
  );
}

// 订阅 = Marzban 上的一个用户，点进去是订阅详情。字体和微信号、邮箱一样（不用等宽字），同一张表里不显得乱
export function SubLink({ username }: { username: string }) {
  return (
    <Link href={`/admin/users/${encodeURIComponent(username)}`} className="link link-hover">
      {username}
    </Link>
  );
}
