import { db } from "@/lib/env";
import { requireCustomer } from "@/lib/session";
import { formatDate, formatExpire, formatMoney, formatSubCode, formatOrderNo } from "@/lib/format";
import { describePlan, findPlan, forSale } from "@/lib/plans";
import { AVAILABLE_SQL } from "@/lib/balance";
import { site } from "@/site.config";
import type { Plan } from "@/site.config.example";
import OrderForm, { type PlanGroup } from "./OrderForm";
import PendingOrder from "./PendingOrder";
import RedeemForm from "./RedeemForm";
import Brand from "../Brand";
import CustomerNav from "../CustomerNav";
import { getT } from "@/lib/lang";
import { pick } from "@/lib/i18n";
import { periodLabel, planName } from "@/lib/plan-text";

export const dynamic = "force-dynamic";

const price = (fen: number) => `${site.currency}${formatMoney(fen).replace(/\.00$/, "")}`;

// ?renew=<用户名>：从订阅页的「续费」按钮过来，默认选好给这个订阅续期
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ renew?: string | string[] }> }) {
  const customer = await requireCustomer();
  const { renew } = await searchParams;
  const { t, p: tx, lang } = await getT();
  const [{ results: subs }, { results: open }, balanceRow] = await Promise.all([
    db()
      .prepare("SELECT marzban_username, code FROM subscriptions WHERE customer_id = ? ORDER BY id")
      .bind(customer.id)
      .all<{ marzban_username: string; code: string | null }>(),
    db()
      .prepare(
        `SELECT id, no, amount, balance_used, plan_id, marzban_username, status, claimed_at, created_at FROM orders
         WHERE customer_id = ? AND status IN ('pending', 'processing') ORDER BY id DESC`,
      )
      .bind(customer.id)
      .all<{
        id: number;
        no: string | null;
        amount: number;
        balance_used: number;
        plan_id: string;
        marzban_username: string | null;
        status: string;
        claimed_at: number | null;
        created_at: number;
      }>(),
    db().prepare(AVAILABLE_SQL).bind(customer.id).first<{ balance: number; reserved: number }>(),
  ]);
  // 下单时能用的余额：已经抵扣在没付款的单上的不能再用
  const balance = Math.max(0, (balanceRow?.balance ?? 0) - (balanceRow?.reserved ?? 0));
  // 下拉框的值是 Marzban 用户名（后端用），给客人看的是订阅编号
  const subscriptions = subs.map((r) => ({ username: r.marzban_username, label: formatSubCode(r.code) }));
  const renewSub = typeof renew === "string" ? subscriptions.find((s) => s.username === renew) : undefined;
  const renewTarget = renewSub?.username;
  const canTransfer = site.payments.length > 0;
  // value 是中文名：后台对账按它显示
  const payments = site.payments.map((p) => ({ value: pick(p.name, "zh"), name: tx(p.name), qr: p.qr }));

  // 按 group 分组，保持配置里的顺序
  const byGroup = new Map<string, Plan[]>();
  for (const p of forSale(site.plans)) {
    const g = p.group ?? p.name;
    byGroup.set(g, [...(byGroup.get(g) ?? []), p]);
  }
  const groups: PlanGroup[] = [...byGroup].map(([name, plans]) => {
    const show = site.planGroups?.[name];
    return {
      name,
      title: show ? tx(show.title) : name,
      lines: show?.lines?.map(tx) ?? [describePlan(plans[0], lang)],
      accent: show?.accent,
      highlight: show?.highlight,
      plans: plans.map((p) => {
        const tag = show?.tags?.[p.id];
        return {
          id: p.id,
          name: planName(p, lang),
          per: periodLabel(p.days, lang).per,
          price: price(p.price),
          amount: formatMoney(p.price).replace(/\.00$/, ""),
          fen: p.price,
          days: p.days,
          tag: tag ? tx(tag) : undefined,
        };
      }),
    };
  });

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <CustomerNav />

      <h1 className="mt-4 mb-4 text-2xl font-bold">{t("购买套餐", "Buy a plan")}</h1>

      {open.length > 0 && (
        <div className="mb-6 flex flex-col gap-4">
          {open.map((o) => (
            <PendingOrder
              key={o.id}
              payments={payments}
              order={{
                id: o.id,
                no: formatOrderNo(o.no),
                planName: (() => {
                  const plan = findPlan(site.plans, o.plan_id);
                  return plan ? planName(plan, lang) : o.plan_id;
                })(),
                amount: price(o.amount - o.balance_used),
                deducted: o.balance_used > 0 ? price(o.balance_used) : null,
                target: o.marzban_username
                  ? (() => {
                      const label = subscriptions.find((s) => s.username === o.marzban_username)?.label ?? "-";
                      return t(`给订阅 ${label} 续期`, `renew subscription ${label}`);
                    })()
                  : t("新开订阅", "new subscription"),
                createdAt: formatDate(o.created_at, lang),
                processing: o.status === "processing",
                claimedAt: o.claimed_at === null ? null : formatExpire(o.claimed_at, lang),
              }}
            />
          ))}
        </div>
      )}

      {site.plans.length === 0 ? (
        <p className="text-base-content/70">{t("套餐还在准备中。", "Plans are coming soon.")}</p>
      ) : (
        <>
          {canTransfer && (
            <p className="mb-3 text-sm text-base-content/70">
              {t(
                "在价目表里点想买的价格，按提示扫码付款，付完点「我已付款」马上开通。有余额时可以直接抵扣。",
                "Tap a price in the table, scan to pay, then tap \"I've paid\" to activate instantly. Your balance can be applied too.",
              )}
            </p>
          )}
          {renewSub && (
            <p className="mb-3 font-medium">
              {t(
                `给订阅 ${renewSub.label} 续期：选一个套餐，续上的天数从原来的到期时间往后加。`,
                `Renewing subscription ${renewSub.label}: pick a plan; the new days are added after the current expiry date.`,
              )}
            </p>
          )}
          <OrderForm
            groups={groups}
            subscriptions={subscriptions}
            canTransfer={canTransfer}
            balance={balance}
            currency={site.currency}
            defaultTarget={renewTarget}
          />
        </>
      )}
      {site.planNotes && site.planNotes.length > 0 && (
        <div className="mt-4 space-y-1 text-sm text-base-content/60">
          {site.planNotes.map((n) => (
            <p key={tx(n)}>{tx(n)}</p>
          ))}
        </div>
      )}

      <div className="mt-8">
        <RedeemForm note={tx(site.purchaseNote)} subscriptions={subscriptions} defaultTarget={renewTarget} />
      </div>
    </div>
  );
}
