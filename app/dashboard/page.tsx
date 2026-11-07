import Link from "next/link";
import { db } from "@/lib/env";
import { requireCustomer } from "@/lib/session";
import { findUser, userUsage, type MarzbanUser } from "@/lib/marzban";
import { monthStartBeijing } from "@/lib/admin-users";
import { latestPeak, peakRingPct } from "@/lib/usage-peak";
import { periodRingPct, parseMarzbanTime, unlimitedRingPct, sortSubs, formatSubCode, formatBytes, formatDate, formatExpire, formatMoney, maskEmail, canRenewEarly, isExpiredSub, needsRenewal, resetLabel, statusLabel, timeLeft } from "@/lib/format";
import { AVAILABLE_SQL, REFERRAL_REWARDS_SQL, type RewardRow } from "@/lib/balance";
import { site } from "@/site.config";
import { describePlan, findPlan } from "@/lib/plans";
import BindForm from "./BindForm";
import HideButton from "./HideButton";
import CopyCode from "./CopyCode";
import NextStep from "./NextStep";
import SubscriptionLink, { ResetLinkButton } from "./SubscriptionLink";
import ReferralCard from "./ReferralCard";
import ContactSupport from "../ContactSupport";
import Brand from "../Brand";
import CustomerNav from "../CustomerNav";
import { RENEW_REFRESH_HINT, detectPlatform, primaryApp, type ImportApp } from "@/lib/clients";
import { headers } from "next/headers";
import { getT } from "@/lib/lang";
import { makeT, pick, type Lang } from "@/lib/i18n";
import { groupName, planName } from "@/lib/plan-text";
import { withCodeDays } from "@/lib/redeem-codes";
import { getTz } from "@/lib/tz-server";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ renewed?: string; opened?: string; days?: string }> }) {
  const customer = await requireCustomer();
  const tz = await getTz();
  // 上个月用得最多的那个订阅用了多少：不限流量的圆环按它当满圈，没算出来时按对数刻度画
  const peak = await latestPeak().catch(() => null);
  const { renewed, opened, days: openedDays } = await searchParams;
  // 兑换码新开了订阅跳过来：标出是什么套餐（码上改过天数的按码上的天数叫，比如「高速版 10天体验」）
  const openedBase = opened ? findPlan(site.plans, opened) : undefined;
  const openedPlan = openedBase && withCodeDays(openedBase, Number(openedDays) || null);
  const { t, lang } = await getT();
  // 大的「一键导入」按钮按客人现在用的设备选 App（iPhone Shadowrocket、Mac 和 Windows Clash Verge、安卓 Hiddify）
  const app = primaryApp(detectPlatform((await headers()).get("user-agent") ?? ""));
  const { results } = await db()
    .prepare("SELECT marzban_username, code, hidden_at FROM subscriptions WHERE customer_id = ? ORDER BY id")
    .bind(customer.id)
    .all<{ marzban_username: string; code: string | null; hidden_at: number | null }>();
  // 被推荐的人给推荐人看微信号（推荐人本来就认识）；没填微信号的老账号显示打码后的邮箱。
  // earned：这个朋友付的款一共给推荐人返了多少
  const { results: referred } = await db()
    .prepare(
      `SELECT c.id, c.email, c.wechat, c.created_at,
         (SELECT COALESCE(SUM(b.amount), 0) FROM balance_entries b JOIN orders o ON o.id = b.order_id
          WHERE b.customer_id = ?1 AND b.kind = 'referral_reward' AND o.customer_id = c.id) AS earned
       FROM customers c WHERE c.referred_by = ?1 ORDER BY c.id DESC`,
    )
    .bind(customer.id)
    .all<{ id: number; email: string; wechat: string | null; created_at: number; earned: number }>();
  // 管理员删掉的客人邮箱换成了 deleted-…@deleted.invalid，不打码显示
  const friend = (r: { email: string; wechat?: string | null }) =>
    r.wechat ? t(`微信 ${r.wechat}`, `WeChat ${r.wechat}`) : r.email.endsWith("@deleted.invalid") ? t("已注销的账号", "Closed account") : maskEmail(r.email);
  // reserved：抵扣在还没付款的单上的部分，付款时才扣，余额里还算着
  const balance = await db().prepare(AVAILABLE_SQL).bind(customer.id).first<{ balance: number; reserved: number }>();
  const { results: rewards } = await db().prepare(REFERRAL_REWARDS_SQL).bind(customer.id).all<RewardRow>();
  const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
  // 每个订阅现在的套餐（付款时自动记，管理员改套餐也改这里），用来当卡片标题；没记过的老订阅显示「我的订阅」
  const { results: paid } = await db()
    .prepare(
      `SELECT p.marzban_username, p.plan_id, p.updated_at FROM marzban_users p
       JOIN subscriptions s ON s.marzban_username = p.marzban_username WHERE s.customer_id = ? AND p.plan_id IS NOT NULL`,
    )
    .bind(customer.id)
    .all<{ marzban_username: string; plan_id: string; updated_at: number }>();
  const planOf = new Map(paid.map((o) => [o.marzban_username, o.plan_id]));
  // 最近一次付款 / 兑换的时间：剩余天数圆环从这一刻的满圈开始倒数；没记过的按 Marzban 上的创建时间
  const renewedAt = new Map(paid.map((o) => [o.marzban_username, o.updated_at]));

  // 一个订阅查失败不影响其他订阅显示。gone：Marzban 上已经没有这个用户（被删了）；user 为 null 且不是 gone：暂时连不上
  const now = Date.now();
  const all = await Promise.all(
    results.map(async ({ marzban_username, code, hidden_at }) => {
      try {
        const user = await findUser(marzban_username);
        // 不限流量的：查本月（北京时间 1 号起）用了多少，画在流量圆环里；查不到就用 Marzban 记的已用流量
        const monthUsed =
          user && !user.data_limit
            ? await userUsage(marzban_username, monthStartBeijing(now), new Date(now))
                .then((r) => r.usages.reduce((n, u) => n + u.used_traffic, 0))
                .catch(() => null)
            : null;
        return { username: marzban_username, code, hiddenAt: hidden_at, user, gone: !user, monthUsed };
      } catch {
        return { username: marzban_username, code, hiddenAt: hidden_at, user: null, gone: false, monthUsed: null };
      }
    }),
  );
  // 客人隐藏过的订阅，只在还是过期 / 已删除时才藏
  const isHidden = (s: (typeof all)[number]) => s.hiddenAt !== null && (s.gone || (!!s.user && isExpiredSub(s.user, now)));
  // 隐藏过、后来又续上了的：清掉隐藏标记，以后再过期或被删时照常显示，让客人自己决定要不要再藏
  const revived = all.filter((s) => s.hiddenAt !== null && s.user && !isExpiredSub(s.user, now));
  if (revived.length) {
    await db().batch(
      revived.map((s) => db().prepare("UPDATE subscriptions SET hidden_at = NULL WHERE customer_id = ? AND marzban_username = ?").bind(customer.id, s.username)),
    );
  }
  // 能用的排最上面，过期的、删掉的往下放（客人新开一个后不用翻过一张过期卡才看到）
  const subs = sortSubs(all.filter((s) => !isHidden(s)), now);
  const hidden = all.filter(isHidden);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <CustomerNav />

      {/* 还没订阅的新客人打个招呼；有订阅了就直接看订阅 */}
      <div className="mt-4 mb-4">
        {subs.length === 0 && <p className="mb-2 text-sm text-base-content/60">{t("你好，", "Hi, ")}{customer.wechat ?? customer.email.split("@")[0]}</p>}
        <h1 className="text-2xl font-bold">{t("我的订阅", "My subscription")}</h1>
      </div>

      {openedPlan && (
        <div role="alert" className="alert alert-success alert-soft mb-4" data-testid="opened">
          <span>
            <b>{t(`开通成功：${openedPlan.name}。`, `Activated: ${planName(openedPlan, lang)}. `)}</b>
            {t("装好 App，点下面的「一键导入」就能用", "Install an app, then tap \"Import\" below to start")}
          </span>
        </div>
      )}

      {/* 「我已付款」或兑换码续期成功后跳过来 */}
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
        {subs.map(({ username, code, user, gone, monthUsed }) =>
          user ? (
            <SubscriptionCard key={username} user={user} code={code} planId={planOf.get(username)} lang={lang} app={app} tz={tz} monthUsed={monthUsed} peak={peak} periodStart={renewedAt.get(username) ?? parseMarzbanTime(user.created_at)} />
          ) : gone ? (
            <GoneCard key={username} username={username} code={code} planId={planOf.get(username)} lang={lang} />
          ) : (
            <UnavailableCard key={username} code={code} planId={planOf.get(username)} lang={lang} />
          ),
        )}
        {subs.length === 0 && <BindForm />}
      </div>

      <div className="mt-8">
        <ReferralCard
          code={customer.referral_code}
          referrals={referred.map((r) => ({
            id: r.id,
            name: friend(r),
            createdAt: formatDate(r.created_at, lang, tz),
            earned: money(r.earned),
            rewards: rewards
              .filter((w) => w.friend_id === r.id)
              .map((w) => ({ date: formatDate(w.created_at, lang, tz), paid: money(w.paid), reward: money(w.reward) })),
          }))}
          balance={money(balance?.balance ?? 0)}
          reserved={balance?.reserved ? money(balance.reserved) : null}
          totalEarned={money(referred.reduce((sum, r) => sum + r.earned, 0))}
        />
      </div>

      {subs.length > 0 && <BindForm compact />}

      {hidden.length > 0 && (
        <details className="mt-6 text-sm text-base-content/60" data-testid="hidden-subs">
          <summary className="cursor-pointer">{t(`已隐藏 ${hidden.length} 个过期或已删除的订阅`, `${hidden.length} hidden expired or removed subscription(s)`)}</summary>
          <ul className="mt-2 space-y-1">
            {hidden.map((h) => (
              <li key={h.username} className="flex items-center justify-between gap-2">
                <span>
                  {t("订阅编号", "Subscription ID")} {formatSubCode(h.code)}
                  <span className="ml-2 text-base-content/40">{h.gone ? t("已删除", "removed") : t("已过期", "expired")}</span>
                </span>
                <HideButton username={h.username} unhide />
              </li>
            ))}
          </ul>
        </details>
      )}
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
      {makeT(lang)("订阅编号", "Subscription ID")} {code ? <CopyCode text={formatSubCode(code)} /> : <span data-testid="sub-id">-</span>}
    </p>
  );
}

function SubscriptionCard({ user, code, planId, lang, app, tz, monthUsed, peak, periodStart }: { user: MarzbanUser; code: string | null; planId?: string; lang: Lang; app: ImportApp; tz: string; monthUsed: number | null; peak: number | null; periodStart: number | null }) {
  const t = makeT(lang);
  const { title, subtitle } = planHeading(planId, lang);
  const status = statusLabel(user.status, lang);
  const left = timeLeft(user.expire, undefined, lang);
  const expired = !!user.expire && user.expire * 1000 <= Date.now();
  const reset = user.data_limit ? resetLabel(user.data_limit_reset_strategy ?? "", lang) : undefined;
  const pct = user.data_limit ? Math.min(100, (user.used_traffic / user.data_limit) * 100) : null;
  // 不限流量：本月已用是上个月最高那位的百分之几，只用来画弧（只按本月用量比，查不到本月用量就不比）
  const vsPeak = !user.data_limit && peak && monthUsed !== null ? peakRingPct(monthUsed, peak) : null;
  // 剩余天数；圆环续费后是满的，之后按续费时剩的总时长变少；不知道续费时间时按套餐天数（不知道套餐就按 30 天）
  const daysLeft = user.expire ? Math.max(0, Math.ceil((user.expire * 1000 - Date.now()) / 86400_000)) : null;
  const plan = planId ? findPlan(site.plans, planId) : undefined;
  const period = plan?.days ?? 30;
  // 免费体验前几天不放续费按钮，最后 3 天的黄色提醒和到期后的红色提示照常
  const trial = !!plan?.codeOnly && plan.price === 0;
  const daysPct = periodRingPct(user.expire, periodStart, Math.floor(Date.now() / 1000), period);
  // 买了还没连过（没有上线时间、也没用过流量）：多半是还不会装 App，卡片最上面放「下一步」引导，连上过一次就不再显示
  const neverUsed = !expired && !user.online_at && !(user.lifetime_used_traffic ?? user.used_traffic);

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="card-title">{title}</h2>
            {subtitle && <p className="mt-1.5 text-sm text-base-content/60">{subtitle}</p>}
          </div>
          <span className={`badge ${status.badge}`}>{status.text}</span>
        </div>

        {neverUsed && <NextStep username={user.username} />}

        {/* 两个圆环：剩余天数（占这期套餐天数的多少）、已用流量。手机上上下排 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <Ring pct={daysPct} tone={left?.urgent ? "text-error" : "text-primary"}>
              <span className="text-lg leading-none font-bold">{daysLeft === null ? "∞" : daysLeft}</span>
              <span className="text-[10px] text-base-content/60">{daysLeft === null ? t("永久", "never") : t("天", daysLeft === 1 ? "day" : "days")}</span>
            </Ring>
            <div className="min-w-0">
              <div className="text-sm text-base-content/60">{t("到期时间", "Expires")}</div>
              <div className="font-medium">{formatExpire(user.expire, lang, tz)}</div>
              {left && <div className={`text-sm ${left.urgent ? "text-error" : "text-base-content/60"}`}>{left.text}</div>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 有上限：按已用比例画。不限流量：圈里写本月用了多少，弧按「本月已用 ÷ 上个月用得最多那位」画
                （只画弧，不写比例、不说基准是什么）；还没算出上个月最高时按对数刻度（unlimitedRingPct） */}
            {pct !== null ? (
              <Ring pct={pct} tone={pct >= 90 ? "text-error" : "text-secondary"}>
                <span className="text-sm leading-none font-bold">{`${Math.round(pct)}%`}</span>
                <span className="text-[10px] text-base-content/60">{t("已用", "used")}</span>
              </Ring>
            ) : (
              <Ring pct={vsPeak ?? unlimitedRingPct(monthUsed ?? user.used_traffic)} tone="text-secondary">
                <span className="text-xs leading-none font-bold tabular-nums">{formatBytes(monthUsed ?? user.used_traffic).replace(" ", "")}</span>
                <span className="text-[10px] text-base-content/60">{monthUsed !== null ? t("本月", "this month") : t("已用", "used")}</span>
              </Ring>
            )}
            <div className="min-w-0">
              <div className="text-sm text-base-content/60">{t("流量", "Data")}</div>
              {user.data_limit ? (
                <div className="font-medium">
                  {formatBytes(user.used_traffic)} / {formatBytes(user.data_limit)}
                </div>
              ) : (
                <>
                  <div className="font-medium">{t("不限流量", "Unlimited")}</div>
                  <div className="text-sm text-base-content/60">
                    {monthUsed !== null ? t(`本月已用 ${formatBytes(monthUsed)}`, `${formatBytes(monthUsed)} used this month`) : t(`已用 ${formatBytes(user.used_traffic)}`, `${formatBytes(user.used_traffic)} used`)}
                  </div>
                </>
              )}
              {reset && <div className="text-sm text-base-content/60">{reset}</div>}
            </div>
          </div>
        </div>

        {/* 已到期：红色提示 + 续费；最后 3 天：黄色提醒 + 续费；7 天以内：只放一个续费按钮；15 天以内放个「提前续费」小链接；再久就什么都不放。
            免费体验只有前两种 */}
        {expired ? (
          <div role="alert" className="alert alert-error flex-wrap justify-between">
            <span>{t("这个订阅已经到期了，续费后从现在开始计算。", "This subscription has expired. If you renew, the new period starts now.")}</span>
            {/* 续费：原来的订阅链接接着用，App 里不用重新导入；也可以新开一个（要重新导入） */}
            <div className="flex flex-wrap gap-2">
              <Link href={`/plans?renew=${encodeURIComponent(user.username)}`} className="btn btn-neutral btn-sm">
                {t("续费", "Renew")}
              </Link>
              <Link href="/plans?new=1" className="btn btn-ghost btn-sm text-error-content">
                {t("新开一个", "Start a new one")}
              </Link>
            </div>
          </div>
        ) : left?.urgent ? (
          <div role="alert" className="alert alert-warning flex-wrap justify-between">
            <span>{t(`这个订阅${left.text}到期，记得续费。`, `This subscription expires soon (${left.text}). Remember to renew.`)}</span>
            <Link href={`/plans?renew=${encodeURIComponent(user.username)}`} className="btn btn-neutral btn-sm">
              {t("续费", "Renew")}
            </Link>
          </div>
        ) : trial ? null : needsRenewal(user.expire) ? (
          <Link href={`/plans?renew=${encodeURIComponent(user.username)}`} className="btn btn-warning btn-sm self-start">
            {t("续费", "Renew")}
          </Link>
        ) : (
          canRenewEarly(user.expire) && (
            <Link href={`/plans?renew=${encodeURIComponent(user.username)}`} className="link link-hover text-sm text-base-content/60">
              {t("提前续费", "Renew early")}
            </Link>
          )
        )}

        <SubscriptionLink username={user.username} url={user.subscription_url} primary={app} />
        {/* 最底下一行：左边重置链接（过期了换成显眼的「从主页隐藏」：过期的链接没什么好重置的），右边订阅编号 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-content/10 pt-3">
          {/* -ml-2 抵掉小按钮自带的左内边距，文字和卡片左边对齐 */}
          <div className={expired ? "flex flex-wrap items-center gap-1" : "-ml-2 flex flex-wrap items-center gap-1"}>
            {expired ? <HideButton username={user.username} prominent /> : <ResetLinkButton username={user.username} />}
          </div>
          <SubscriptionId code={code} lang={lang} />
        </div>
      </div>
    </div>
  );
}

// 圆环进度（daisyUI radial-progress），中间放数字
function Ring({ pct, tone, children }: { pct: number; tone: string; children: React.ReactNode }) {
  return (
    <div
      className={`radial-progress relative shrink-0 ${tone}`}
      // 底下画一圈浅色轨道，不然只有进度那一段弧
      style={{ "--value": Math.round(pct), "--size": "4.25rem", "--thickness": "6px", boxShadow: "inset 0 0 0 6px var(--color-base-300)" } as React.CSSProperties}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
    >
      <span className="relative flex flex-col items-center text-base-content">{children}</span>
    </div>
  );
}

// Marzban 上已经没有这个用户了（管理员删了）。直说，客人可以把它从主页隐藏，记录留着
// 删掉 / 查不到的卡片标题：知道是什么套餐就写套餐名（和正常卡片一样），右上角标状态；不知道就写「已删除的订阅」之类。
// 以前写「我的订阅」，和整页标题一样，看不出是哪一个
function DeadCardHeader({ planId, fallback, badge, badgeClass, lang }: { planId?: string; fallback: string; badge: string; badgeClass: string; lang: Lang }) {
  const { title, subtitle } = planHeading(planId, lang);
  const known = !!planId && findPlan(site.plans, planId);
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <h2 className="card-title">{known ? title : fallback}</h2>
        {known && subtitle && <p className="mt-1.5 text-sm text-base-content/60">{subtitle}</p>}
      </div>
      <span className={`badge ${badgeClass}`}>{badge}</span>
    </div>
  );
}

function GoneCard({ username, code, planId, lang }: { username: string; code: string | null; planId?: string; lang: Lang }) {
  const t = makeT(lang);
  return (
    <div className="card bg-base-100 shadow-sm" data-testid="sub-gone">
      <div className="card-body">
        <DeadCardHeader planId={planId} fallback={t("已删除的订阅", "Removed subscription")} badge={t("已删除", "Removed")} badgeClass="badge-neutral" lang={lang} />
        <div role="alert" className="alert alert-soft">
          {t("查不到这个订阅了，可能已经删除。如需联系客服，请报上下方订阅编号。", "This subscription no longer exists; it may have been removed. If you contact support, please give the subscription ID below.")}
        </div>
        {/* 删掉的续不了，引导重新开一个 */}
        <Link href="/plans?new=1" className="btn btn-primary btn-sm self-start">
          {t("重新开一个订阅", "Get a new subscription")}
        </Link>
        <ContactSupport />
        <div className="flex items-center justify-between gap-2">
          {/* Marzban 上已经删掉的：和过期的一样，做成显眼的按钮 */}
          <HideButton username={username} prominent />
          <SubscriptionId code={code} lang={lang} />
        </div>
      </div>
    </div>
  );
}

// Marzban 暂时连不上（不是删了）：只能等
function UnavailableCard({ code, planId, lang }: { code: string | null; planId?: string; lang: Lang }) {
  const t = makeT(lang);
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <DeadCardHeader planId={planId} fallback={t("订阅", "Subscription")} badge={t("暂时查不到", "Unavailable")} badgeClass="badge-warning" lang={lang} />
        <div role="alert" className="alert alert-warning alert-soft">
          {t(
            "暂时连不上服务器，查不到这个订阅的信息，请稍后刷新。如需联系客服，请报上下方订阅编号。",
            "Can't reach the server to load this subscription. Please refresh in a moment; if you contact support, give the subscription ID below.",
          )}
        </div>
        <ContactSupport />
        <SubscriptionId code={code} lang={lang} />
      </div>
    </div>
  );
}
