import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/env";
import { requireCustomer } from "@/lib/session";
import { describePlan } from "@/lib/plans";
import { upgradeQuote } from "@/lib/orders";
import { AVAILABLE_SQL } from "@/lib/balance";
import { formatExpire, formatMoney, formatSubCode } from "@/lib/format";
import { groupName } from "@/lib/plan-text";
import { pick } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { getTz } from "@/lib/tz-server";
import { site } from "@/site.config";
import type { Plan } from "@/site.config.example";
import CustomerNav from "../../CustomerNav";
import UpgradeForm from "./UpgradeForm";

export const dynamic = "force-dynamic";

// 订阅卡片上的「升级套餐」：换成更高的档，到期时间不变，只补剩下天数的差价（lib/plans.ts 的 upgradeOptions）
export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ sub?: string | string[] }> }) {
  const customer = await requireCustomer();
  const { sub } = await searchParams;
  if (typeof sub !== "string") notFound();
  const { t, lang } = await getT();
  const tz = await getTz();
  const row = await db()
    .prepare("SELECT code FROM subscriptions WHERE customer_id = ? AND marzban_username = ?")
    .bind(customer.id, sub)
    .first<{ code: string | null }>();
  if (!row) notFound();
  const now = Math.floor(Date.now() / 1000);
  const [{ user, current, options }, avail] = await Promise.all([
    upgradeQuote(sub, now),
    db().prepare(AVAILABLE_SQL).bind(customer.id).first<{ balance: number; reserved: number }>(),
  ]);
  const balance = Math.max(0, (avail?.balance ?? 0) - (avail?.reserved ?? 0));
  const daysLeft = user?.expire ? Math.ceil((user.expire - now) / 86400) : 0;
  // 档位的名字和说明照价目表：「高速版双设备」「双设备 不限流量」
  const line = (p: Plan) => {
    const g = p.group ?? p.name;
    const l = site.planGroups?.[g]?.lines?.at(-1);
    return { name: groupName(g, lang), desc: l ? pick(l, lang) : describePlan(p, lang) };
  };
  const money = (fen: number) => `${site.currency}${formatMoney(fen).replace(/\.00$/, "")}`;
  const monthly = (p: Plan) => money(p.price);
  const curGroup = current ? (current.group ?? current.name) : "";
  const curMonthly = site.plans.find((p) => (p.group ?? p.name) === curGroup && p.days === 30 && !p.codeOnly)?.price ?? 0;

  return (
    <div className="mx-auto max-w-xl px-4 pb-16">
      <CustomerNav />
      <h1 className="mt-4 mb-1 text-2xl font-bold">{t("升级套餐", "Upgrade plan")}</h1>
      <p className="mb-5 text-sm text-base-content/60">
        {t(`订阅 ${formatSubCode(row.code)}`, `Subscription ${formatSubCode(row.code)}`)}
        {current && ` · ${t("现在是", "currently")} ${line(current).name}`}
        {user?.expire ? ` · ${t("到期", "expires")} ${formatExpire(user.expire, lang, tz)}${t(`（还剩 ${daysLeft} 天）`, ` (${daysLeft} days left)`)}` : ""}
      </p>
      {options.length === 0 ? (
        <div className="alert">
          <span>
            {!current
              ? t("这个订阅暂时不能在网页上升级，请联系客服。", "This subscription can't be upgraded online. Please contact support.")
              : user?.expire && user.expire <= now
                ? t("订阅已经到期，直接续费选新的套餐就行。", "This subscription has expired. Just renew and pick the new plan.")
                : t("已经是最高的套餐了。", "You're already on the top plan.")}
          </span>
          <Link href="/dashboard" className="btn btn-sm">{t("返回", "Back")}</Link>
        </div>
      ) : (
        <UpgradeForm
          username={sub}
          daysLeft={daysLeft}
          currentMonthly={money(curMonthly)}
          options={options.map((o) => ({ id: o.plan.id, ...line(o.plan), monthly: monthly(o.plan), fen: o.price }))}
          balance={balance}
          canTransfer={site.payments.length > 0}
          currency={site.currency}
        />
      )}
    </div>
  );
}
