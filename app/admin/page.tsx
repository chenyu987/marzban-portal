import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatExpire, formatMoney } from "@/lib/format";
import { findPlan } from "@/lib/plans";
import { site } from "@/site.config";
import AdminHeader from "./AdminHeader";
import OrderActions from "./OrderActions";
import VerifyActions from "./VerifyActions";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  email: string;
  wechat: string | null;
  amount: number;
  balance_used: number;
  method: string;
  status: string;
  plan_id: string | null;
  marzban_username: string | null;
  claimed_at: number | null;
  pay_method: string | null;
  payer: string | null;
  new_sub: number | null;
  paid_at: number | null;
  created_at: number;
};

const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
const planName = (id: string | null) => (id ? (findPlan(site.plans, id)?.name ?? `${id}（已下架）`) : "（没有套餐）");
const target = (o: Row) => (o.marzban_username ? `续期 ${o.marzban_username}` : "新开订阅");
// 客人实际要转的钱，抵扣了余额的写在后面
const due = (o: Row) =>
  `${money(o.amount - o.balance_used)}${o.balance_used > 0 ? `（套餐价 ${money(o.amount)}，余额抵扣 ${money(o.balance_used)}）` : ""}`;

const SELECT = `SELECT o.id, c.email, c.wechat, o.amount, o.balance_used, o.method, o.status, o.plan_id, o.marzban_username,
  o.claimed_at, o.pay_method, o.payer, o.new_sub, o.paid_at, o.created_at FROM orders o JOIN customers c ON c.id = o.customer_id`;

// 客人点「我已付款」的时间精确到秒（北京时间），和账单里的到账时间对
const exact = (t: number | null) =>
  t === null
    ? "-"
    : new Date(t * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }).replace(/\//g, "-");
const who = (o: Row) => `${o.email}${o.wechat ? `（微信 ${o.wechat}）` : ""}`;

export default async function AdminHome() {
  const admin = await requireAdmin();
  // 开通中的（出过问题，要核对）排最前，然后是客人说已付的（按点的时间），最后是还没付的
  const [{ results: open }, { results: unverified }, { results: recent }] = await Promise.all([
    db()
      .prepare(
        `${SELECT} WHERE o.method IN ('transfer', 'balance') AND o.status IN ('pending', 'processing')
         ORDER BY o.status = 'processing' DESC, o.claimed_at IS NULL, o.claimed_at, o.id`,
      )
      .all<Row>(),
    // 先开通后对账：客人点了「我已付款」已经开通，等管理员去账单里对
    db()
      .prepare(`${SELECT} WHERE o.method = 'transfer' AND o.status = 'paid' AND o.verified_at IS NULL ORDER BY o.claimed_at, o.id`)
      .all<Row>(),
    db()
      .prepare(
        `${SELECT} WHERE o.method IN ('transfer', 'balance') AND o.status IN ('paid', 'cancelled', 'revoked')
         AND NOT (o.method = 'transfer' AND o.status = 'paid' AND o.verified_at IS NULL) ORDER BY o.id DESC LIMIT 10`,
      )
      .all<Row>(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <AdminHeader email={admin.email} />

      <h1 className="mt-4 mb-1 text-2xl font-bold">已开通、待对账</h1>
      <p className="mb-4 text-sm text-base-content/60">
        客人付完款点「我已付款」就自动开通了。按点的时间、金额、付款方式和付款人去账单里找这笔钱：找到了点「确认到账」，找不到点「没收到钱」把订阅收回。
      </p>
      {unverified.length === 0 && <p className="text-base-content/60">没有要对账的单。</p>}
      <div className="flex flex-col gap-3">
        {unverified.map((o) => {
          const summary = `订单 ${o.id}｜${o.email}｜${planName(o.plan_id)}｜${o.marzban_username}｜应收 ${money(o.amount - o.balance_used)}｜${o.pay_method ?? "?"}`;
          return (
            <div key={o.id} className="card border border-info bg-base-100 shadow-sm" data-testid="unverified-order">
              <div className="card-body gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">订单 {o.id}</span>
                  <span className="badge badge-info">{o.new_sub ? "新开" : "续期"} {o.marzban_username}</span>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <span className="text-base-content/60">应收</span>
                  <b>{due(o)}</b>
                  <span className="text-base-content/60">付款方式</span>
                  <span>{o.pay_method ?? "-"}</span>
                  <span className="text-base-content/60">付款人</span>
                  <span>{o.payer ?? "（没填）"}</span>
                  <span className="text-base-content/60">点已付款</span>
                  <span>{exact(o.claimed_at)}</span>
                  <span className="text-base-content/60">客人</span>
                  <span>{who(o)}</span>
                  <span className="text-base-content/60">套餐</span>
                  <span>{planName(o.plan_id)}</span>
                </div>
                <VerifyActions id={o.id} summary={summary} isNew={!!o.new_sub} />
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mt-10 mb-1 text-xl font-bold">待处理的订单</h2>
      <p className="mb-4 text-sm text-base-content/60">
        客人点了「我已付款」但自动开通没成功的会留在这里，在账单里找到这笔钱再确认开通。没点「我已付款」的一般就是还没付。
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
                        ? `客人 ${exact(o.claimed_at)} 说已付（${o.pay_method ?? "?"}${o.payer ? `，${o.payer}` : ""}），自动开通失败`
                        : "还没付"}
                  </span>
                </div>
                <div className="text-sm">
                  {who(o)}｜{planName(o.plan_id)}｜{target(o)}
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
              {o.status === "paid" ? `已付款 ${formatExpire(o.paid_at)}` : o.status === "revoked" ? "没收到钱，已收回" : "已取消"}
              {o.method === "balance" ? "（余额付）" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
