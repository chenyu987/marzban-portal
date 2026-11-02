import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatBytes, formatDate, formatExpire, formatMoney, STATUS_LABEL, formatSubCode, timeLeft } from "@/lib/format";
import { getUser, type MarzbanUser } from "@/lib/marzban";
import { findPlan } from "@/lib/plans";
import { site } from "@/site.config";
import AdminHeader from "../../AdminHeader";
import CustomerActions from "./CustomerActions";
import { CustomerLink, SubLink } from "../../Links";
import { ORDER_METHOD, ORDER_STATUS } from "../../ui";
import BindButton from "../../BindButton";

export const dynamic = "force-dynamic";

const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
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
    db()
      .prepare(
        `SELECT s.marzban_username, s.code, p.plan_id FROM subscriptions s
         LEFT JOIN subscription_plans p ON p.marzban_username = s.marzban_username WHERE s.customer_id = ? ORDER BY s.id`,
      )
      .bind(id)
      .all<{ marzban_username: string; code: string | null; plan_id: string | null }>(),
    db()
      .prepare("SELECT id, amount, balance_used, method, status, plan_id, marzban_username, created_at, paid_at FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 50")
      .bind(id)
      .all<{ id: number; amount: number; balance_used: number; method: string; status: string; plan_id: string | null; marzban_username: string | null; created_at: number; paid_at: number | null }>(),
    db()
      .prepare("SELECT id, amount, kind, order_id, note, created_at FROM balance_entries WHERE customer_id = ? ORDER BY id DESC LIMIT 50")
      .bind(id)
      .all<{ id: number; amount: number; kind: string; order_id: number | null; note: string | null; created_at: number }>(),
    // 推荐的人，以及每个人给这位客人返了多少
    db()
      .prepare(
        `SELECT r.id, r.email, r.wechat, r.created_at,
           (SELECT COALESCE(SUM(b.amount), 0) FROM balance_entries b JOIN orders o ON o.id = b.order_id
            WHERE b.customer_id = ?1 AND b.kind = 'referral_reward' AND o.customer_id = r.id) AS earned
         FROM customers r WHERE r.referred_by = ?1 ORDER BY r.id DESC`,
      )
      .bind(id)
      .all<{ id: number; email: string; wechat: string | null; created_at: number; earned: number }>(),
  ]);
  // 微信号一样、还没绑给任何人的老订阅：多半是他的，给一键绑定（要管理员确认）
  const { results: maybe } = c.wechat
    ? await db()
        .prepare(
          `SELECT w.marzban_username FROM marzban_wechat w
           WHERE w.wechat = ? COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.marzban_username = w.marzban_username)`,
        )
        .bind(c.wechat)
        .all<{ marzban_username: string }>()
    : { results: [] as { marzban_username: string }[] };
  const totals = await db()
    .prepare(
      `SELECT (SELECT COALESCE(SUM(amount), 0) FROM balance_entries WHERE customer_id = ?1) AS balance,
         (SELECT COALESCE(SUM(amount), 0) FROM orders WHERE customer_id = ?1 AND status = 'paid') AS paid,
         (SELECT COUNT(*) FROM orders WHERE customer_id = ?1 AND status = 'paid') AS paid_n`,
    )
    .bind(id)
    .first<{ balance: number; paid: number; paid_n: number }>();
  // 每个订阅现在的状态从 Marzban 查，查不到也不影响页面
  const users = await Promise.all(
    subs.results.map(async ({ marzban_username, code, plan_id }) => {
      const plan = plan_id ? (findPlan(site.plans, plan_id)?.name ?? plan_id) : null;
      try {
        return { username: marzban_username, code, plan, user: (await getUser(marzban_username)) as MarzbanUser | null };
      } catch {
        return { username: marzban_username, code, plan, user: null };
      }
    }),
  );

  const info: [string, React.ReactNode][] = [
    ["邮箱", c.email],
    ["微信号", c.wechat ?? <span className="text-base-content/50">没填（老账号）</span>],
    ["注册", formatExpire(c.created_at)],
    ["推荐码", <span className="font-mono">{c.referral_code}</span>],
    ["推荐人", c.referrer_id ? <CustomerLink id={c.referrer_id} email={c.referrer ?? ""} /> : "无"],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <Link href="/admin/customers" className="link link-hover text-sm text-base-content/60">
        ← 客人列表
      </Link>

      <div className="mt-2 mb-4 rounded-box bg-base-100 p-4 shadow-sm">
        <h1 className="text-2xl font-bold">
          {c.wechat ?? c.email}
          {c.wechat && <span className="ml-2 align-middle text-sm font-normal text-base-content/60">{c.email}</span>}
        </h1>
        <div className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {info.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="w-14 shrink-0 text-base-content/60">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-box bg-base-200 p-2">
            <div className="text-xs text-base-content/60">余额</div>
            <div className="font-bold">{money(totals?.balance ?? 0)}</div>
          </div>
          <div className="rounded-box bg-base-200 p-2">
            <div className="text-xs text-base-content/60">累计付款</div>
            <div className="font-bold">
              {money(totals?.paid ?? 0)}
              <span className="ml-1 text-xs font-normal text-base-content/60">{totals?.paid_n ?? 0} 单</span>
            </div>
          </div>
          <div className="rounded-box bg-base-200 p-2">
            <div className="text-xs text-base-content/60">推荐了</div>
            <div className="font-bold">{referred.results.length} 人</div>
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">订阅（{users.length}）</h2>
        <Link href={`/admin/users/new?customer=${encodeURIComponent(c.wechat ?? c.email)}`} className="btn btn-sm btn-primary">
          给这个客人新开订阅
        </Link>
      </div>
      {maybe.length > 0 && (
        <div role="alert" className="alert alert-info alert-soft mb-3 flex-wrap" data-testid="maybe-subs">
          <span>微信号一样的老订阅，多半是他的：</span>
          {maybe.map((m) => (
            <span key={m.marzban_username} className="flex items-center gap-1">
              <SubLink username={m.marzban_username} />
              <BindButton customerId={c.id} username={m.marzban_username} who={c.wechat ?? c.email} />
            </span>
          ))}
        </div>
      )}
      {users.length === 0 && <p className="mb-2 text-sm text-base-content/60">名下还没有订阅。可以新开一个，或者在下面把 Marzban 上已有的订阅绑过来。</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {users.map(({ username, code, plan, user }) => {
          const st = user ? (STATUS_LABEL[user.status] ?? { text: user.status, badge: "badge-neutral" }) : null;
          const pct = user?.data_limit ? Math.min(100, (user.used_traffic / user.data_limit) * 100) : null;
          const left = user ? timeLeft(user.expire) : null;
          return (
            <Link
              key={username}
              href={`/admin/users/${encodeURIComponent(username)}`}
              className="rounded-box bg-base-100 p-4 shadow-sm transition hover:shadow-md"
              data-testid="customer-sub"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold">{username}</span>
                {st ? <span className={`badge badge-sm ${st.badge}`}>{st.text}</span> : <span className="badge badge-sm badge-error">Marzban 上查不到</span>}
              </div>
              <div className="text-xs text-base-content/50">
                {plan ?? "没记套餐"}｜订阅编号 {formatSubCode(code)}
              </div>
              {user && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-base-content/60">到期</div>
                    <div>{formatExpire(user.expire)}</div>
                    {left && <div className={`text-xs ${left.urgent ? "text-error" : "text-base-content/60"}`}>{left.text}</div>}
                  </div>
                  <div>
                    <div className="text-xs text-base-content/60">流量</div>
                    <div>
                      {formatBytes(user.used_traffic)} / {user.data_limit ? formatBytes(user.data_limit) : "不限"}
                    </div>
                    {pct !== null && <progress className={`progress h-1.5 w-full ${pct >= 90 ? "progress-error" : "progress-primary"}`} value={pct} max={100} />}
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <h2 className="mt-8 mb-2 text-lg font-bold">操作</h2>
      <CustomerActions customerId={c.id} email={c.email} />

      <div className="mt-8 mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold">订单（{orders.results.length}）</h2>
        <Link href={`/admin?view=all&q=${encodeURIComponent(c.email)}`} className="link link-hover text-sm">
          在订单页里看
        </Link>
      </div>
      {orders.results.length === 0 ? (
        <p className="text-sm text-base-content/60">没有订单。</p>
      ) : (
        <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>订单</th>
                <th>套餐</th>
                <th className="text-right">金额</th>
                <th>怎么付</th>
                <th>订阅</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {orders.results.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{o.plan_id ? (findPlan(site.plans, o.plan_id)?.name ?? o.plan_id) : "只记账"}</td>
                  <td className="text-right whitespace-nowrap">
                    {money(o.amount)}
                    {o.balance_used > 0 && o.method === "transfer" && <div className="text-xs text-base-content/50">余额抵扣 {money(o.balance_used)}</div>}
                  </td>
                  <td>{ORDER_METHOD[o.method] ?? o.method}</td>
                  <td>{o.marzban_username ? <SubLink username={o.marzban_username} /> : "-"}</td>
                  <td>
                    <span className={`badge badge-sm ${ORDER_STATUS[o.status]?.badge ?? "badge-ghost"}`}>{ORDER_STATUS[o.status]?.text ?? o.status}</span>
                  </td>
                  <td className="whitespace-nowrap text-base-content/60">{formatExpire(o.paid_at ?? o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 mb-2 text-lg font-bold">余额明细</h2>
      {entries.results.length === 0 ? (
        <p className="text-sm text-base-content/60">没有记录。</p>
      ) : (
        <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
          <table className="table table-sm">
            <tbody>
              {entries.results.map((e) => (
                <tr key={e.id}>
                  <td>
                    {KIND[e.kind] ?? e.kind}
                    {e.order_id ? `（订单 ${e.order_id}）` : ""}
                    {e.note ? `：${e.note}` : ""}
                  </td>
                  <td className={`text-right whitespace-nowrap ${e.amount >= 0 ? "text-success" : "text-error"}`}>
                    {e.amount >= 0 ? "+" : "-"}
                    {money(Math.abs(e.amount))}
                  </td>
                  <td className="whitespace-nowrap text-base-content/60">{formatExpire(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 mb-2 text-lg font-bold">推荐的人（{referred.results.length}）</h2>
      {referred.results.length === 0 ? (
        <p className="text-sm text-base-content/60">还没推荐过人。</p>
      ) : (
        <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
          <table className="table table-sm">
            <tbody>
              {referred.results.map((r) => (
                <tr key={r.id}>
                  <td>
                    <CustomerLink id={r.id} email={r.email} wechat={r.wechat} />
                  </td>
                  <td className="text-right">
                    已给这位客人返 <b className="text-success">{money(r.earned)}</b>
                  </td>
                  <td className="whitespace-nowrap text-base-content/60">{formatDate(r.created_at)} 注册</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
