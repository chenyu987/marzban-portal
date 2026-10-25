import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatExpire, formatMoney } from "@/lib/format";
import { findPlan } from "@/lib/plans";
import { site } from "@/site.config";
import AdminHeader from "./AdminHeader";
import OrderActions from "./OrderActions";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  email: string;
  amount: number;
  balance_used: number;
  method: string;
  status: string;
  plan_id: string | null;
  marzban_username: string | null;
  claimed_at: number | null;
  paid_at: number | null;
  created_at: number;
};

const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
const planName = (id: string | null) => (id ? (findPlan(site.plans, id)?.name ?? `${id}（已下架）`) : "（没有套餐）");
const target = (o: Row) => (o.marzban_username ? `续期 ${o.marzban_username}` : "新开订阅");
// 客人实际要转的钱，抵扣了余额的写在后面
const due = (o: Row) =>
  `${money(o.amount - o.balance_used)}${o.balance_used > 0 ? `（套餐价 ${money(o.amount)}，余额抵扣 ${money(o.balance_used)}）` : ""}`;

const SELECT = `SELECT o.id, c.email, o.amount, o.balance_used, o.method, o.status, o.plan_id, o.marzban_username,
  o.claimed_at, o.paid_at, o.created_at FROM orders o JOIN customers c ON c.id = o.customer_id`;

export default async function AdminHome() {
  const admin = await requireAdmin();
  // 开通中的（出过问题，要核对）排最前，然后是客人说已付的（按点的时间），最后是还没付的
  const [{ results: open }, { results: recent }] = await Promise.all([
    db()
      .prepare(
        `${SELECT} WHERE o.method IN ('transfer', 'balance') AND o.status IN ('pending', 'processing')
         ORDER BY o.status = 'processing' DESC, o.claimed_at IS NULL, o.claimed_at, o.id`,
      )
      .all<Row>(),
    db()
      .prepare(`${SELECT} WHERE o.method IN ('transfer', 'balance') AND o.status IN ('paid', 'cancelled') ORDER BY o.id DESC LIMIT 10`)
      .all<Row>(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <AdminHeader email={admin.email} />

      <h1 className="mt-4 mb-1 text-2xl font-bold">待处理的订单</h1>
      <p className="mb-4 text-sm text-base-content/60">
        在支付宝账单里找到这笔钱（按客人点「我已付款」的时间和金额，有备注的看订单号）再确认。没点「我已付款」的一般就是还没付。
      </p>
      {open.length === 0 && <p className="text-base-content/60">没有待处理的订单。</p>}
      <div className="flex flex-col gap-3">
        {open.map((o) => {
          const stuck = o.status === "processing";
          const summary = `订单 ${o.id}｜${o.email}｜${planName(o.plan_id)}｜${target(o)}｜应收 ${money(o.amount - o.balance_used)}`;
          return (
            <div key={o.id} className={`card bg-base-100 shadow-sm ${stuck ? "border border-error" : o.claimed_at ? "border border-warning" : ""}`}>
              <div className="card-body gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">订单 {o.id}</span>
                  <span className={`badge ${stuck ? "badge-error" : o.claimed_at ? "badge-warning" : "badge-ghost"}`}>
                    {stuck
                      ? `开通中，需要核对${o.method === "balance" ? "（余额付款）" : ""}`
                      : o.claimed_at
                        ? `客人 ${formatExpire(o.claimed_at)} 说已付`
                        : "还没付"}
                  </span>
                </div>
                <div className="text-sm">
                  {o.email}｜{planName(o.plan_id)}｜{target(o)}
                </div>
                <div className="text-sm">
                  应收 <b>{due(o)}</b>，{formatExpire(o.created_at)} 下单
                </div>
                {stuck ? (
                  <p className="text-sm text-error">
                    上次开通出了问题，不确定 Marzban 改没改。去面板核对后用命令行处理：npm run orders -- confirm {o.id} --done 用户名 --remote（已经改好）或 --again（确实没改）
                  </p>
                ) : (
                  o.method === "transfer" && <OrderActions id={o.id} summary={summary} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mt-10 mb-3 text-lg font-bold">最近处理过的</h2>
      <ul className="divide-y divide-base-200 text-sm">
        {recent.map((o) => (
          <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span>
              订单 {o.id}｜{o.email}｜{planName(o.plan_id)}｜{o.marzban_username ?? "-"}
            </span>
            <span className="text-base-content/60">
              {o.status === "paid" ? `已付款 ${formatExpire(o.paid_at)}` : "已取消"}
              {o.method === "balance" ? "（余额付）" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
