import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatBytes, formatDate, formatExpire, formatMoney, STATUS_LABEL, formatSubCode } from "@/lib/format";
import { getUser, type MarzbanUser } from "@/lib/marzban";
import { findPlan } from "@/lib/plans";
import { site } from "@/site.config";
import AdminHeader from "../../AdminHeader";
import CustomerActions from "./CustomerActions";

export const dynamic = "force-dynamic";

const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
const ORDER_STATUS: Record<string, string> = { pending: "等付款", processing: "开通中", paid: "已付款", cancelled: "已取消" };
const METHOD: Record<string, string> = { transfer: "转账", balance: "余额", redeem_code: "兑换码", manual: "手动记账" };
const KIND: Record<string, string> = { referral_reward: "推荐奖励", purchase: "买套餐", adjust: "管理员调整", withdrawal: "提现" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const c = await db()
    .prepare(
      `SELECT c.id, c.email, c.wechat, c.referral_code, c.created_at, r.id AS referrer_id, r.email AS referrer
       FROM customers c LEFT JOIN customers r ON r.id = c.referred_by WHERE c.id = ?`,
    )
    .bind(id)
    .first<{ id: number; email: string; wechat: string | null; referral_code: string; created_at: number; referrer_id: number | null; referrer: string | null }>();
  if (!c) notFound();

  const [subs, orders, entries, referred] = await Promise.all([
    db().prepare("SELECT marzban_username, code FROM subscriptions WHERE customer_id = ? ORDER BY id").bind(id).all<{ marzban_username: string; code: string | null }>(),
    db()
      .prepare("SELECT id, amount, balance_used, method, status, plan_id, marzban_username, created_at, paid_at FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 50")
      .bind(id)
      .all<{ id: number; amount: number; balance_used: number; method: string; status: string; plan_id: string | null; marzban_username: string | null; created_at: number; paid_at: number | null }>(),
    db()
      .prepare("SELECT id, amount, kind, order_id, note, created_at FROM balance_entries WHERE customer_id = ? ORDER BY id DESC LIMIT 50")
      .bind(id)
      .all<{ id: number; amount: number; kind: string; order_id: number | null; note: string | null; created_at: number }>(),
    db().prepare("SELECT id, email, created_at FROM customers WHERE referred_by = ? ORDER BY id DESC").bind(id).all<{ id: number; email: string; created_at: number }>(),
  ]);
  const balance = await db()
    .prepare("SELECT COALESCE(SUM(amount), 0) AS b FROM balance_entries WHERE customer_id = ?")
    .bind(id)
    .first<{ b: number }>();
  // 每个订阅现在的状态从 Marzban 查，查不到也不影响页面
  const users = await Promise.all(
    subs.results.map(async ({ marzban_username, code }) => {
      try {
        return { username: marzban_username, code, user: (await getUser(marzban_username)) as MarzbanUser | null };
      } catch {
        return { username: marzban_username, code, user: null };
      }
    }),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <Link href="/admin/customers" className="link link-hover text-sm text-base-content/60">
        ← 客人列表
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{c.email}</h1>
      <p className="mb-4 text-sm text-base-content/60">
        {formatDate(c.created_at)} 注册｜微信 {c.wechat ?? "未填"}｜推荐码 {c.referral_code}｜推荐人{" "}
        {c.referrer_id ? (
          <Link href={`/admin/customers/${c.referrer_id}`} className="link">
            {c.referrer}
          </Link>
        ) : (
          "无"
        )}
        ｜余额 <b>{money(balance?.b ?? 0)}</b>
      </p>

      <CustomerActions customerId={c.id} email={c.email} />

      <h2 className="mt-8 mb-2 text-lg font-bold">订阅（{users.length}）</h2>
      {users.length === 0 && <p className="text-sm text-base-content/60">没有订阅。</p>}
      <ul className="divide-y divide-base-200 text-sm">
        {users.map(({ username, code, user }) => (
          <li key={username} className="flex flex-wrap justify-between gap-2 py-2">
            <span>
              <span className="font-medium">{username}</span>
              <span className="ml-2 text-xs text-base-content/50">编号 {formatSubCode(code)}</span>
            </span>
            {user ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className={`badge badge-sm ${STATUS_LABEL[user.status]?.badge ?? "badge-neutral"}`}>{STATUS_LABEL[user.status]?.text ?? user.status}</span>
                到期 {formatExpire(user.expire)}｜流量 {formatBytes(user.used_traffic)} / {user.data_limit ? formatBytes(user.data_limit) : "不限"}｜备注 {user.note || "-"}
              </span>
            ) : (
              <span className="text-error">Marzban 上查不到</span>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mt-8 mb-2 text-lg font-bold">订单</h2>
      {orders.results.length === 0 && <p className="text-sm text-base-content/60">没有订单。</p>}
      <ul className="divide-y divide-base-200 text-sm">
        {orders.results.map((o) => (
          <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span>
              订单 {o.id}｜{o.plan_id ? (findPlan(site.plans, o.plan_id)?.name ?? o.plan_id) : "只记账"}｜{money(o.amount)}
              {o.balance_used > 0 && o.method === "transfer" ? `（余额抵扣 ${money(o.balance_used)}）` : ""}｜{METHOD[o.method] ?? o.method}｜
              {o.marzban_username ?? "-"}
            </span>
            <span className="text-base-content/60">
              {ORDER_STATUS[o.status] ?? o.status}｜{formatExpire(o.paid_at ?? o.created_at)}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 mb-2 text-lg font-bold">余额明细</h2>
      {entries.results.length === 0 && <p className="text-sm text-base-content/60">没有记录。</p>}
      <ul className="divide-y divide-base-200 text-sm">
        {entries.results.map((e) => (
          <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span>
              {KIND[e.kind] ?? e.kind}
              {e.order_id ? `（订单 ${e.order_id}）` : ""}
              {e.note ? `：${e.note}` : ""}
            </span>
            <span className={e.amount >= 0 ? "text-success" : "text-error"}>
              {e.amount >= 0 ? "+" : "-"}
              {money(Math.abs(e.amount))}｜{formatExpire(e.created_at)}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 mb-2 text-lg font-bold">推荐的人（{referred.results.length}）</h2>
      <ul className="divide-y divide-base-200 text-sm">
        {referred.results.map((r) => (
          <li key={r.id} className="flex justify-between py-2">
            <Link href={`/admin/customers/${r.id}`} className="link link-hover">
              {r.email}
            </Link>
            <span className="text-base-content/60">{formatDate(r.created_at)} 注册</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
