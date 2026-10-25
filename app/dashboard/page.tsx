import Link from "next/link";
import { db } from "@/lib/env";
import { requireCustomer } from "@/lib/session";
import { getUser, type MarzbanUser } from "@/lib/marzban";
import { formatBytes, formatDate, formatExpire, formatMoney, maskEmail, RESET_LABEL, STATUS_LABEL, timeLeft } from "@/lib/format";
import { BALANCE_SQL, REFERRAL_REWARDS_SQL, type RewardRow } from "@/lib/balance";
import { site } from "@/site.config";
import { BRAND } from "@/lib/clients";
import { logout } from "../actions";
import BindForm from "./BindForm";
import SubscriptionLink from "./SubscriptionLink";
import ReferralCard from "./ReferralCard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const customer = await requireCustomer();
  const { results } = await db()
    .prepare("SELECT marzban_username FROM subscriptions WHERE customer_id = ? ORDER BY id")
    .bind(customer.id)
    .all<{ marzban_username: string }>();
  // 被推荐的人只给推荐人看打码后的邮箱
  const { results: referred } = await db()
    .prepare("SELECT email, created_at FROM customers WHERE referred_by = ? ORDER BY id DESC")
    .bind(customer.id)
    .all<{ email: string; created_at: number }>();
  const balance = await db().prepare(BALANCE_SQL).bind(customer.id).first<{ balance: number }>();
  const { results: rewards } = await db().prepare(REFERRAL_REWARDS_SQL).bind(customer.id).all<RewardRow>();
  const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;

  // 一个订阅查失败不影响其他订阅显示
  const subs = await Promise.all(
    results.map(async ({ marzban_username }) => {
      try {
        return { username: marzban_username, user: await getUser(marzban_username) };
      } catch {
        return { username: marzban_username, user: null };
      }
    }),
  );

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="navbar px-0">
        <div className="flex-1 text-xl font-bold">{BRAND}</div>
        <span className="mr-3 hidden text-sm text-base-content/70 sm:inline">{customer.email}</span>
        <Link href="/plans" className="btn btn-ghost btn-sm">
          购买/续费
        </Link>
        <Link href="/tutorial" className="btn btn-ghost btn-sm">
          安装教程
        </Link>
        <form action={logout}>
          <button className="btn btn-ghost btn-sm">退出</button>
        </form>
      </header>

      <h1 className="mt-4 mb-4 text-2xl font-bold">我的订阅</h1>

      <div className="flex flex-col gap-4">
        {subs.length === 0 && (
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body">
              <p>
                你还没有订阅。
                <Link href="/plans" className="link link-primary">
                  去买一个套餐
                </Link>
                ，或者如果管理员之前发过订阅链接给你，在下面粘贴就能绑定到这个账号。
              </p>
            </div>
          </div>
        )}
        {subs.map(({ username, user }) =>
          user ? <SubscriptionCard key={username} user={user} /> : <UnavailableCard key={username} username={username} />,
        )}
        <BindForm />
      </div>

      <div className="mt-8">
        <ReferralCard
          code={customer.referral_code}
          referrals={referred.map((r) => ({ email: maskEmail(r.email), createdAt: formatDate(r.created_at) }))}
          balance={money(balance?.balance ?? 0)}
          rewards={rewards.map((r) => ({
            email: maskEmail(r.email),
            date: formatDate(r.created_at),
            paid: money(r.paid),
            reward: money(r.reward),
          }))}
        />
      </div>
    </div>
  );
}

function SubscriptionCard({ user }: { user: MarzbanUser }) {
  const status = STATUS_LABEL[user.status] ?? { text: user.status, badge: "badge-neutral" };
  const left = timeLeft(user.expire);
  const reset = user.data_limit ? RESET_LABEL[user.data_limit_reset_strategy ?? ""] : undefined;
  const pct = user.data_limit ? Math.min(100, (user.used_traffic / user.data_limit) * 100) : null;

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title">{user.username}</h2>
          <span className={`badge ${status.badge}`}>{status.text}</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-base-content/60">到期时间</div>
            <div className="font-medium">{formatExpire(user.expire)}</div>
            {left && <div className={`text-sm ${left.urgent ? "text-error" : "text-base-content/60"}`}>{left.text}</div>}
          </div>
          <div>
            <div className="text-sm text-base-content/60">流量</div>
            <div className="font-medium">
              {formatBytes(user.used_traffic)} / {user.data_limit ? formatBytes(user.data_limit) : "不限"}
            </div>
            {pct !== null && (
              <progress
                className={`progress w-full ${pct >= 90 ? "progress-error" : "progress-primary"}`}
                value={pct}
                max={100}
              />
            )}
            {reset && <div className="text-sm text-base-content/60">{reset}</div>}
          </div>
        </div>

        <SubscriptionLink username={user.username} url={user.subscription_url} />
      </div>
    </div>
  );
}

function UnavailableCard({ username }: { username: string }) {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="card-title">{username}</h2>
        <div role="alert" className="alert alert-warning alert-soft">
          暂时查不到这个订阅的信息，请稍后刷新。一直这样的话请联系管理员。
        </div>
      </div>
    </div>
  );
}
