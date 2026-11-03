import Link from "next/link";
import { db } from "@/lib/env";
import { requireCustomer } from "@/lib/session";
import { getUser, type MarzbanUser } from "@/lib/marzban";
import { formatSubCode, formatBytes, formatDate, formatExpire, formatMoney, maskEmail, needsRenewal, resetLabel, statusLabel, timeLeft } from "@/lib/format";
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
import { getT } from "@/lib/lang";
import { makeT, pick, type Lang } from "@/lib/i18n";
import { groupName } from "@/lib/plan-text";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ renewed?: string }> }) {
  const customer = await requireCustomer();
  const { renewed } = await searchParams;
  const { t, lang } = await getT();
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
  const friend = (r: { email: string; wechat?: string | null }) => (r.wechat ? t(`微信 ${r.wechat}`, `WeChat ${r.wechat}`) : maskEmail(r.email));
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
        {subs.length === 0 && <p className="text-sm text-base-content/60">{t("你好，", "Hi, ")}{customer.wechat ?? customer.email.split("@")[0]}</p>}
        <h1 className="text-2xl font-bold">{t("我的订阅", "My subscription")}</h1>
      </div>

      {/* 「我已付款」续期成功后跳过来 */}
      {renewed && (
        <div role="alert" className="alert alert-success alert-soft mb-4" data-testid="renewed">
          <span>
            <b>{t("续期成功。", "Renewed. ")}</b>
            {RENEW_REFRESH_HINT[lang]}{t("。", ".")}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {subs.length === 0 && (
          <div className="card bg-base-100 shadow-sm" data-testid="onboarding">
            <div className="card-body gap-4">
              <h2 className="card-title">{t("三步用上", "Get started in 3 steps")}</h2>
              <ol className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    title: t("选套餐付款", "Pick a plan and pay"),
                    desc: t("支付宝或微信扫码，付完点「我已付款」马上开通", "Scan with Alipay or WeChat, then tap \"I've paid\" to activate instantly"),
                    href: "/plans",
                    cta: t("去选套餐", "Choose a plan"),
                  },
                  {
                    title: t("装客户端", "Install an app"),
                    desc: t("按你的设备装好 App，教程每一步都有截图", "Install the app for your device; the guide has a screenshot for every step"),
                    href: "/tutorial",
                    cta: t("看安装教程", "Open the setup guide"),
                  },
                  {
                    title: t("一键导入", "Import"),
                    desc: t("开通后回到这里，点你用的客户端就能导入", "Once it's active, come back here and tap your app to import"),
                    href: null,
                    cta: null,
                  },
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
              <p className="text-sm text-base-content/60">
                {t("以前客服直接发过订阅链接给你的，在下面粘贴就能绑到这个账号。", "If support sent you a subscription link before, paste it below to link it to this account.")}
              </p>
            </div>
          </div>
        )}
        {subs.map(({ username, code, user }) =>
          user ? (
            <SubscriptionCard key={username} user={user} code={code} planId={planOf.get(username)} lang={lang} />
          ) : (
            <UnavailableCard key={username} code={code} lang={lang} />
          ),
        )}
        {subs.length === 0 && <BindForm />}
      </div>

      <div className="mt-8">
        <ReferralCard
          code={customer.referral_code}
          referrals={referred.map((r) => ({ email: friend(r), createdAt: formatDate(r.created_at, lang), earned: money(r.earned) }))}
          balance={money(balance?.balance ?? 0)}
          rewards={rewards.map((r) => ({
            email: friend(r),
            date: formatDate(r.created_at, lang),
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
function planHeading(planId: string | undefined, lang: Lang): { title: string; subtitle?: string } {
  const t = makeT(lang);
  const plan = planId ? findPlan(site.plans, planId) : undefined;
  if (!plan) return { title: t("我的订阅", "My subscription") };
  const group = plan.group ?? plan.name;
  const name = groupName(group, lang);
  const line = site.planGroups?.[group]?.lines?.at(-1);
  // 免费体验在档位名后面标「（体验）」；在它上面续费后套餐就换成续费的那个，标题跟着变
  return {
    title: plan.codeOnly && plan.price === 0 ? t(`${name}（体验）`, `${name} (trial)`) : name,
    subtitle: line ? pick(line, lang) : describePlan(plan, lang),
  };
}

// 订阅编号是随机的（7F3A-9C21），看不出是第几单；客人找客服时报这个，后台客人页能按它搜
function SubscriptionId({ code, lang }: { code: string | null; lang: Lang }) {
  return (
    <p className="text-right text-xs text-base-content/50">
      {makeT(lang)("订阅编号", "Subscription ID")} <span data-testid="sub-id">{formatSubCode(code)}</span>
    </p>
  );
}

function SubscriptionCard({ user, code, planId, lang }: { user: MarzbanUser; code: string | null; planId?: string; lang: Lang }) {
  const t = makeT(lang);
  const { title, subtitle } = planHeading(planId, lang);
  const status = statusLabel(user.status, lang);
  const left = timeLeft(user.expire, undefined, lang);
  const expired = !!user.expire && user.expire * 1000 <= Date.now();
  const reset = user.data_limit ? resetLabel(user.data_limit_reset_strategy ?? "", lang) : undefined;
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
              <span className="text-[10px] text-base-content/60">{daysLeft === null ? t("永久", "never") : t("天", daysLeft === 1 ? "day" : "days")}</span>
            </Ring>
            <div className="min-w-0">
              <div className="text-sm text-base-content/60">{t("到期时间", "Expires")}</div>
              <div className="font-medium">{formatExpire(user.expire, lang)}</div>
              {left && <div className={`text-sm ${left.urgent ? "text-error" : "text-base-content/60"}`}>{left.text}</div>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Ring pct={pct ?? 0} tone={pct !== null && pct >= 90 ? "text-error" : "text-secondary"}>
              <span className="text-sm leading-none font-bold">{pct === null ? "∞" : `${Math.round(pct)}%`}</span>
              <span className="text-[10px] text-base-content/60">{pct === null ? t("不限", "unlimited") : t("已用", "used")}</span>
            </Ring>
            <div className="min-w-0">
              <div className="text-sm text-base-content/60">{t("流量", "Data")}</div>
              <div className="font-medium">
                {formatBytes(user.used_traffic)} / {user.data_limit ? formatBytes(user.data_limit) : t("不限", "Unlimited")}
              </div>
              {reset && <div className="text-sm text-base-content/60">{reset}</div>}
            </div>
          </div>
        </div>

        {/* 已到期：红色提示 + 续费；最后 3 天：黄色提醒 + 续费；7 天以内：只放一个续费按钮；其他时候放个「提前续费」小链接 */}
        {expired ? (
          <div role="alert" className="alert alert-error flex-wrap justify-between">
            <span>{t("这个订阅已经到期了，续费后马上恢复。", "This subscription has expired. Renew to restore it right away.")}</span>
            <Link href={`/plans?renew=${encodeURIComponent(user.username)}`} className="btn btn-neutral btn-sm">
              {t("续费", "Renew")}
            </Link>
          </div>
        ) : left?.urgent ? (
          <div role="alert" className="alert alert-warning flex-wrap justify-between">
            <span>{t(`这个订阅${left.text}到期，记得续费。`, `This subscription expires soon (${left.text}). Remember to renew.`)}</span>
            <Link href={`/plans?renew=${encodeURIComponent(user.username)}`} className="btn btn-neutral btn-sm">
              {t("续费", "Renew")}
            </Link>
          </div>
        ) : needsRenewal(user.expire) ? (
          <Link href={`/plans?renew=${encodeURIComponent(user.username)}`} className="btn btn-warning btn-sm self-start">
            {t("续费", "Renew")}
          </Link>
        ) : (
          user.expire && (
            <Link href={`/plans?renew=${encodeURIComponent(user.username)}`} className="link link-hover text-sm text-base-content/60">
              {t("提前续费", "Renew early")}
            </Link>
          )
        )}

        <SubscriptionLink username={user.username} url={user.subscription_url} />
        <SubscriptionId code={code} lang={lang} />
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

function UnavailableCard({ code, lang }: { code: string | null; lang: Lang }) {
  const t = makeT(lang);
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="card-title">{t("我的订阅", "My subscription")}</h2>
        <div role="alert" className="alert alert-warning alert-soft">
          {t(
            "暂时查不到这个订阅的信息，请稍后刷新。一直这样的话请联系客服，报上下面的订阅编号。",
            "Can't load this subscription right now. Please refresh in a moment; if it keeps happening, contact support with the subscription ID below.",
          )}
        </div>
        <ContactSupport />
        <SubscriptionId code={code} lang={lang} />
      </div>
    </div>
  );
}
