import Link from "next/link";
import { db } from "@/lib/env";
import { requireCustomer } from "@/lib/session";
import { formatDate, formatExpire, formatMoney } from "@/lib/format";
import { findPlan } from "@/lib/plans";
import { BALANCE_SQL } from "@/lib/balance";
import { BRAND } from "@/lib/clients";
import { site } from "@/site.config";
import type { Plan } from "@/site.config.example";
import OrderForm, { type PlanGroup } from "./OrderForm";
import PendingOrder from "./PendingOrder";
import RedeemForm from "./RedeemForm";

export const dynamic = "force-dynamic";

const price = (fen: number) => `${site.currency}${formatMoney(fen).replace(/\.00$/, "")}`;

// ?renew=<用户名>：从订阅页的「续费」按钮过来，默认选好给这个订阅续期
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ renew?: string | string[] }> }) {
  const customer = await requireCustomer();
  const { renew } = await searchParams;
  const [{ results: subs }, { results: open }, balanceRow] = await Promise.all([
    db()
      .prepare("SELECT marzban_username FROM subscriptions WHERE customer_id = ? ORDER BY id")
      .bind(customer.id)
      .all<{ marzban_username: string }>(),
    db()
      .prepare(
        `SELECT id, amount, balance_used, plan_id, marzban_username, status, claimed_at, created_at FROM orders
         WHERE customer_id = ? AND status IN ('pending', 'processing') ORDER BY id DESC`,
      )
      .bind(customer.id)
      .all<{
        id: number;
        amount: number;
        balance_used: number;
        plan_id: string;
        marzban_username: string | null;
        status: string;
        claimed_at: number | null;
        created_at: number;
      }>(),
    db().prepare(BALANCE_SQL).bind(customer.id).first<{ balance: number }>(),
  ]);
  const balance = balanceRow?.balance ?? 0;
  const subscriptions = subs.map((r) => r.marzban_username);
  const renewTarget = typeof renew === "string" && subscriptions.includes(renew) ? renew : undefined;
  const canTransfer = site.payments.length > 0;

  // 按 group 分组，保持配置里的顺序
  const byGroup = new Map<string, Plan[]>();
  for (const p of site.plans) {
    const g = p.group ?? p.name;
    byGroup.set(g, [...(byGroup.get(g) ?? []), p]);
  }
  const groups: PlanGroup[] = [...byGroup].map(([name, plans]) => {
    const show = site.planGroups?.[name];
    return {
      name,
      title: show?.title ?? name,
      lines: show?.lines ?? [describe(plans[0])],
      accent: show?.accent,
      highlight: show?.highlight,
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        label: p.name.replace(name, "").trim() || `${p.days} 天`,
        price: price(p.price),
        amount: formatMoney(p.price).replace(/\.00$/, ""),
        fen: p.price,
        tag: show?.tags?.[p.id],
      })),
    };
  });

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="navbar px-0">
        <div className="flex-1 text-xl font-bold">{BRAND}</div>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          我的订阅
        </Link>
        <Link href="/tutorial" className="btn btn-ghost btn-sm">
          安装教程
        </Link>
      </header>

      <h1 className="mt-4 mb-4 text-2xl font-bold">购买套餐</h1>

      {open.length > 0 && (
        <div className="mb-6 flex flex-col gap-4">
          {open.map((o) => (
            <PendingOrder
              key={o.id}
              payments={site.payments}
              order={{
                id: o.id,
                planName: findPlan(site.plans, o.plan_id)?.name ?? o.plan_id,
                amount: price(o.amount - o.balance_used),
                deducted: o.balance_used > 0 ? price(o.balance_used) : null,
                target: o.marzban_username ? `给 ${o.marzban_username} 续期` : "新开订阅",
                createdAt: formatDate(o.created_at),
                processing: o.status === "processing",
                claimedAt: o.claimed_at === null ? null : formatExpire(o.claimed_at),
              }}
            />
          ))}
        </div>
      )}

      {site.plans.length === 0 ? (
        <p className="text-base-content/70">套餐还在准备中。</p>
      ) : (
        <>
          {canTransfer && <p className="mb-3 text-sm text-base-content/70">点价格下单，按提示转账，付完点「我已付款」，管理员核对收款后自动开通。有余额时可以直接抵扣，够付全款就马上开通。</p>}
          {renewTarget && <p className="mb-3 font-medium">给 {renewTarget} 续期：选一个套餐，续上的天数从原来的到期时间往后加。</p>}
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
            <p key={n}>{n}</p>
          ))}
        </div>
      )}

      <div className="mt-8">
        <RedeemForm note={site.purchaseNote} subscriptions={subscriptions} defaultTarget={renewTarget} />
      </div>
    </div>
  );
}

function describe(p: Plan): string {
  const data = p.dataGB === null ? "不限流量" : `${p.dataGB} GB${p.dataReset === "month" ? "/月" : ""}`;
  return data;
}
