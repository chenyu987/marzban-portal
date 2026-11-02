import Link from "next/link";
import { db } from "@/lib/env";
import { requireCustomer } from "@/lib/session";
import { getUser, type MarzbanUser } from "@/lib/marzban";
import { formatSubCode, formatBytes, formatDate, formatExpire, formatMoney, maskEmail, needsRenewal, RESET_LABEL, STATUS_LABEL, timeLeft } from "@/lib/format";
import { BALANCE_SQL, REFERRAL_REWARDS_SQL, type RewardRow } from "@/lib/balance";
import { site } from "@/site.config";
import { describePlan, findPlan } from "@/lib/plans";
import { BRAND } from "@/lib/clients";
import { logout } from "../actions";
import BindForm from "./BindForm";
import SubscriptionLink from "./SubscriptionLink";
import ReferralCard from "./ReferralCard";
import ContactSupport from "../ContactSupport";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const customer = await requireCustomer();
  const { results } = await db()
    .prepare("SELECT marzban_username, code FROM subscriptions WHERE customer_id = ? ORDER BY id")
    .bind(customer.id)
    .all<{ marzban_username: string; code: string | null }>();
  // 被推荐的人给推荐人看微信号（推荐人本来就认识）；没填微信号的老账号显示打码后的邮箱。
  // earned：这个朋友付的款一共给推荐人返了多少
  const { results: referred } = await db()
    .prepare(
      `SELECT c.email, c.wechat, c.created_at,
         (SELECT COALESCE(SUM(b.amount), 0) FROM balance_entries b JOIN orders o ON o.id = b.order_id
          WHERE b.customer_id = ?1 AND b.kind = 'referral_reward' AND o.customer_id = c.id) AS earned
       FROM customers c WHERE c.referred_by = ?1 ORDER BY c.id DESC`,
    )
    .bind(customer.id)
    .all<{ email: string; wechat: string | null; created_at: number; earned: number }>();
  const friend = (r: { email: string; wechat?: string | null }) => (r.wechat ? `微信 ${r.wechat}` : maskEmail(r.email));
  const balance = await db().prepare(BALANCE_SQL).bind(customer.id).first<{ balance: number }>();
  const { results: rewards } = await db().prepare(REFERRAL_REWARDS_SQL).bind(customer.id).all<RewardRow>();
  const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
  // 每个订阅最近一次付款买的套餐，用来当卡片标题；管理员直接发链接、后来绑定进来的老订阅没有订单
  const { results: paid } = await db()
    .prepare(
      `SELECT marzban_username, plan_id FROM orders
       WHERE customer_id = ? AND status = 'paid' AND plan_id IS NOT NULL AND marzban_username IS NOT NULL ORDER BY id`,
    )
    .bind(customer.id)
    .all<{ marzban_username: string; plan_id: string }>();
  const planOf = new Map(paid.map((o) => [o.marzban_username, o.plan_id]));

  // 一个订阅查失败不影响其他订阅显示
  const subs = await Promise.all(
    results.map(async ({ marzban_username, code }) => {
      try {
        return { username: marzban_username, code, user: await getUser(marzban_username) };
      } catch {
        return { username: marzban_username, code, user: null };
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
        {subs.map(({ username, code, user }) =>
          user ? (
            <SubscriptionCard key={username} user={user} code={code} planId={planOf.get(username)} />
          ) : (
            <UnavailableCard key={username} code={code} />
          ),
        )}
        {subs.length === 0 && <BindForm />}
      </div>

      <div className="mt-8">
        <ReferralCard
          code={customer.referral_code}
          referrals={referred.map((r) => ({ email: friend(r), createdAt: formatDate(r.created_at), earned: money(r.earned) }))}
          balance={money(balance?.balance ?? 0)}
          rewards={rewards.map((r) => ({
            email: friend(r),
            date: formatDate(r.created_at),
            paid: money(r.paid),
            reward: money(r.reward),
          }))}
        />
      </div>

      {subs.length > 0 && <BindForm compact />}
    </div>
  );
}

// 标题用套餐档位名（不带月付、季付：续费可能换周期）；副标题优先用价目表上那行说明，比如「单设备  20G流量/月」
function planHeading(planId: string | undefined): { title: string; subtitle?: string } {
  const plan = planId ? findPlan(site.plans, planId) : undefined;
  if (!plan) return { title: "我的订阅" };
  const group = plan.group ?? plan.name;
  return { title: group, subtitle: site.planGroups?.[group]?.lines?.at(-1) ?? describePlan(plan) };
}

// 订阅编号是随机的（7F3A-9C21），看不出是第几单；客人找客服时报这个，后台客人页能按它搜
function SubscriptionId({ code }: { code: string | null }) {
  return (
    <p className="text-right text-xs text-base-content/50">
      订阅编号 <span data-testid="sub-id">{formatSubCode(code)}</span>
    </p>
  );
}

function SubscriptionCard({ user, code, planId }: { user: MarzbanUser; code: string | null; planId?: string }) {
  const { title, subtitle } = planHeading(planId);
  const status = STATUS_LABEL[user.status] ?? { text: user.status, badge: "badge-neutral" };
  const left = timeLeft(user.expire);
  const reset = user.data_limit ? RESET_LABEL[user.data_limit_reset_strategy ?? ""] : undefined;
  const pct = user.data_limit ? Math.min(100, (user.used_traffic / user.data_limit) * 100) : null;

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="card-title">{title}</h2>
            {subtitle && <p className="text-sm text-base-content/60">{subtitle}</p>}
          </div>
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

        {needsRenewal(user.expire) ? (
          <div role="alert" className="alert alert-warning alert-soft flex-wrap justify-between">
            <span>{left?.text === "已到期" ? "这个订阅已经到期了，续费后马上恢复。" : `这个订阅${left?.text ?? "快"}到期，记得续费。`}</span>
            <Link href={`/plans?renew=${encodeURIComponent(user.username)}`} className="btn btn-warning btn-sm">
              续费
            </Link>
          </div>
        ) : (
          user.expire && (
            <Link href={`/plans?renew=${encodeURIComponent(user.username)}`} className="link link-hover text-sm text-base-content/60">
              提前续费
            </Link>
          )
        )}

        <SubscriptionLink username={user.username} url={user.subscription_url} />
        <SubscriptionId code={code} />
      </div>
    </div>
  );
}

function UnavailableCard({ code }: { code: string | null }) {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="card-title">我的订阅</h2>
        <div role="alert" className="alert alert-warning alert-soft">
          暂时查不到这个订阅的信息，请稍后刷新。一直这样的话请联系客服，报上下面的订阅编号。
        </div>
        <ContactSupport />
        <SubscriptionId code={code} />
      </div>
    </div>
  );
}
