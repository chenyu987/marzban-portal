import Link from "next/link";
import { db } from "@/lib/env";
import { requireCustomer } from "@/lib/session";
import { getUser, type MarzbanUser } from "@/lib/marzban";
import { formatSubCode, formatBytes, formatDate, formatExpire, formatMoney, maskEmail, needsRenewal, RESET_LABEL, STATUS_LABEL, timeLeft } from "@/lib/format";
import { BALANCE_SQL, REFERRAL_REWARDS_SQL, type RewardRow } from "@/lib/balance";
import { site } from "@/site.config";
import { describePlan, findPlan } from "@/lib/plans";
import BindForm from "./BindForm";
import SubscriptionLink from "./SubscriptionLink";
import ReferralCard from "./ReferralCard";
import ContactSupport from "../ContactSupport";
import Brand from "../Brand";
import CustomerNav from "../CustomerNav";
import { RENEW_REFRESH_HINT } from "@/lib/clients";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ renewed?: string }> }) {
  const customer = await requireCustomer();
  const { renewed } = await searchParams;
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
  // 每个订阅现在的套餐（付款时自动记，管理员改套餐也改这里），用来当卡片标题；没记过的老订阅显示「我的订阅」
  const { results: paid } = await db()
    .prepare(
      `SELECT p.marzban_username, p.plan_id FROM subscription_plans p
       JOIN subscriptions s ON s.marzban_username = p.marzban_username WHERE s.customer_id = ?`,
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
      <CustomerNav />

      {/* 还没订阅的新客人打个招呼；有订阅了就直接看订阅 */}
      <div className="mt-4 mb-4">
        {subs.length === 0 && <p className="text-sm text-base-content/60">你好，{customer.wechat ?? customer.email.split("@")[0]}</p>}
        <h1 className="text-2xl font-bold">我的订阅</h1>
      </div>

      {/* 「我已付款」续期成功后跳过来 */}
      {renewed && (
        <div role="alert" className="alert alert-success alert-soft mb-4" data-testid="renewed">
          <span>
            <b>续期成功。</b>
            {RENEW_REFRESH_HINT}。
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {subs.length === 0 && (
          <div className="card bg-base-100 shadow-sm" data-testid="onboarding">
            <div className="card-body gap-4">
              <h2 className="card-title">三步用上</h2>
              <ol className="grid gap-3 sm:grid-cols-3">
                {[
                  { title: "选套餐付款", desc: "支付宝或微信扫码，付完点「我已付款」马上开通", href: "/plans", cta: "去选套餐" },
                  { title: "装客户端", desc: "按你的设备装好 App，教程每一步都有截图", href: "/tutorial", cta: "看安装教程" },
                  { title: "一键导入", desc: "开通后回到这里，点你用的客户端就能导入", href: null, cta: null },
                ].map((s, i) => (
                  <li key={s.title} className="flex flex-col gap-2 rounded-box bg-base-200 p-4">
                    <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full font-bold text-white">{i + 1}</span>
                    <b>{s.title}</b>
                    <span className="text-sm text-base-content/60">{s.desc}</span>
                    {s.href && (
                      <Link href={s.href} className={`btn btn-sm mt-auto ${i === 0 ? "btn-primary" : ""}`}>
                        {s.cta}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
              <p className="text-sm text-base-content/60">以前客服直接发过订阅链接给你的，在下面粘贴就能绑到这个账号。</p>
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
  // 剩余天数和这期套餐的总天数（不知道套餐就按 30 天画环）
  const daysLeft = user.expire ? Math.max(0, Math.ceil((user.expire * 1000 - Date.now()) / 86400_000)) : null;
  const period = (planId ? findPlan(site.plans, planId)?.days : undefined) ?? 30;
  const daysPct = daysLeft === null ? 100 : Math.min(100, (daysLeft / period) * 100);

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

        {/* 两个圆环：剩余天数（占这期套餐天数的多少）、已用流量。手机上上下排 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <Ring pct={daysPct} tone={left?.urgent ? "text-error" : "text-primary"}>
              <span className="text-lg leading-none font-bold">{daysLeft === null ? "∞" : daysLeft}</span>
              <span className="text-[10px] text-base-content/60">{daysLeft === null ? "永久" : "天"}</span>
            </Ring>
            <div className="min-w-0">
              <div className="text-sm text-base-content/60">到期时间</div>
              <div className="font-medium">{formatExpire(user.expire)}</div>
              {left && <div className={`text-sm ${left.urgent ? "text-error" : "text-base-content/60"}`}>{left.text}</div>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Ring pct={pct ?? 0} tone={pct !== null && pct >= 90 ? "text-error" : "text-secondary"}>
              <span className="text-sm leading-none font-bold">{pct === null ? "∞" : `${Math.round(pct)}%`}</span>
              <span className="text-[10px] text-base-content/60">{pct === null ? "不限" : "已用"}</span>
            </Ring>
            <div className="min-w-0">
              <div className="text-sm text-base-content/60">流量</div>
              <div className="font-medium">
                {formatBytes(user.used_traffic)} / {user.data_limit ? formatBytes(user.data_limit) : "不限"}
              </div>
              {reset && <div className="text-sm text-base-content/60">{reset}</div>}
            </div>
          </div>
        </div>

        {needsRenewal(user.expire) ? (
          <div role="alert" className={`alert flex-wrap justify-between ${left?.text === "已到期" ? "alert-error" : "alert-warning"}`}>
            <span>{left?.text === "已到期" ? "这个订阅已经到期了，续费后马上恢复。" : `这个订阅${left?.text ?? "快"}到期，记得续费。`}</span>
            <Link href={`/plans?renew=${encodeURIComponent(user.username)}`} className="btn btn-neutral btn-sm">
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

// 圆环进度（daisyUI radial-progress），中间放数字
function Ring({ pct, tone, children }: { pct: number; tone: string; children: React.ReactNode }) {
  return (
    <div
      className={`radial-progress shrink-0 ${tone}`}
      // 底下画一圈浅色轨道，不然只有进度那一段弧
      style={{ "--value": Math.round(pct), "--size": "4.25rem", "--thickness": "6px", boxShadow: "inset 0 0 0 6px var(--color-base-300)" } as React.CSSProperties}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
    >
      <span className="flex flex-col items-center text-base-content">{children}</span>
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
