import Link from "next/link";

// 后台里客人、订阅互相跳转的链接，所有页面统一用这两个，不用自己去搜
// 客人显示微信号（客服最常用），后面小字是邮箱
export function CustomerLink({ id, email, wechat }: { id: number; email: string; wechat?: string | null }) {
  return (
    <Link href={`/admin/customers/${id}`} className="link link-hover">
      {wechat ? (
        <>
          {wechat}
          <span className="ml-1 text-xs text-base-content/50">{email}</span>
        </>
      ) : (
        email
      )}
    </Link>
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
