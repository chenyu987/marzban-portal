import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { findUser, type MarzbanUser } from "@/lib/marzban";
import { formatBytes, formatExpire, RESET_LABEL, STATUS_LABEL, timeLeft } from "@/lib/format";
import { onlineText, toBeijingInput } from "@/lib/admin-users";
import AdminHeader from "../../AdminHeader";
import { adminEditUser } from "../../actions";
import UserForm from "../UserForm";
import UserActions from "./UserActions";

export const dynamic = "force-dynamic";

// 一个 Marzban 用户：看状态、改流量/到期/状态/备注、清零流量、重置订阅链接、删除。都是直接改 Marzban
export default async function UserPage({ params }: { params: Promise<{ username: string }> }) {
  const admin = await requireAdmin();
  const username = decodeURIComponent((await params).username);
  let user: MarzbanUser | null;
  try {
    user = await findUser(username);
  } catch (e) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <AdminHeader email={admin.email} />
        <div role="alert" className="alert alert-error alert-soft mt-4">
          查 Marzban 出错：{e instanceof Error ? e.message : String(e)}
        </div>
      </div>
    );
  }
  if (!user) notFound();

  const owner = await db()
    .prepare("SELECT c.id, c.email, c.wechat FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE s.marzban_username = ?")
    .bind(username)
    .first<{ id: number; email: string; wechat: string | null }>();
  const st = STATUS_LABEL[user.status] ?? { text: user.status, badge: "badge-neutral" };
  const left = timeLeft(user.expire);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <Link href="/admin/users" className="link link-hover text-sm text-base-content/60">
        ← 用户列表
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{user.username}</h1>
        <span className={`badge ${st.badge}`}>{st.text}</span>
      </div>
      <p className="mb-4 text-sm text-base-content/60">
        客人{" "}
        {owner ? (
          <Link href={`/admin/customers/${owner.id}`} className="link">
            {owner.wechat ? `${owner.wechat}（${owner.email}）` : owner.email}
          </Link>
        ) : (
          "没绑（去客人详情页绑定）"
        )}
        ｜最后连接 {onlineText(user.online_at, Date.now())}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-4 rounded-box bg-base-100 p-4 shadow-sm">
        <div>
          <div className="text-sm text-base-content/60">到期</div>
          <div className="font-medium">{formatExpire(user.expire)}</div>
          {left && <div className="text-sm text-base-content/60">{left.text}</div>}
        </div>
        <div>
          <div className="text-sm text-base-content/60">流量</div>
          <div className="font-medium">
            {formatBytes(user.used_traffic)} / {user.data_limit ? formatBytes(user.data_limit) : "不限"}
          </div>
          <div className="text-sm text-base-content/60">
            {user.data_limit ? (RESET_LABEL[user.data_limit_reset_strategy ?? ""] ?? "不重置") : ""}
            {user.lifetime_used_traffic != null && `（累计 ${formatBytes(user.lifetime_used_traffic)}）`}
          </div>
        </div>
      </div>

      <UserActions username={user.username} url={user.subscription_url} />

      <h2 className="mt-8 mb-2 text-lg font-bold">修改</h2>
      <UserForm
        action={adminEditUser}
        username={user.username}
        defaults={{
          dataGB: user.data_limit ? String(Math.round((user.data_limit / 1024 ** 3) * 100) / 100) : "",
          reset: user.data_limit_reset_strategy ?? "no_reset",
          expire: toBeijingInput(user.expire),
          note: user.note ?? "",
          // 到期、流量用完这些是 Marzban 自己算的，表单里只能选启用或停用
          status: user.status === "disabled" ? "disabled" : "active",
        }}
      />
    </div>
  );
}
