import Link from "next/link";
import CopyButton from "../../CopyButton";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatBytes, formatDate, formatExpire, formatMoney, statusLabel, formatSubCode, timeLeft, formatOrderNo } from "@/lib/format";
import { getUser, type MarzbanUser } from "@/lib/marzban";
import { findPlan } from "@/lib/plans";
import { site } from "@/site.config";
import AdminHeader from "../../AdminHeader";
import CustomerActions, { DeleteCustomer } from "./CustomerActions";
import { CustomerLink, SubLink } from "../../Links";
import { orderMethod, orderStatus } from "../../ui";
import BindButton from "../../BindButton";
import { getTz } from "@/lib/tz-server";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const tz = await getTz();
  const { t, lang } = await getT();
  const ORDER_STATUS = orderStatus(t);
  const ORDER_METHOD = orderMethod(t);
  const KIND: Record<string, string> = {
    referral_reward: t("推荐奖励", "Referral reward"),
    purchase: t("买套餐", "Plan purchase"),
    adjust: t("管理员调整", "Admin adjustment"),
    withdrawal: t("提现", "Withdrawal"),
  };
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const c = await db()
    .prepare(
      `SELECT c.id, c.email, c.wechat, c.referral_code, c.created_at, c.deleted_at, r.id AS referrer_id, r.email AS referrer
       FROM customers c LEFT JOIN customers r ON r.id = c.referred_by WHERE c.id = ?`,
    )
    .bind(id)
    .first<{ id: number; email: string; wechat: string | null; referral_code: string; created_at: number; deleted_at: number | null; referrer_id: number | null; referrer: string | null }>();
  if (!c) notFound();

  const [subs, orders, entries, referred] = await Promise.all([
    db()
      .prepare(
        `SELECT s.marzban_username, s.code, p.plan_id FROM subscriptions s
         LEFT JOIN marzban_users p ON p.marzban_username = s.marzban_username WHERE s.customer_id = ? ORDER BY s.id`,
      )
      .bind(id)
      .all<{ marzban_username: string; code: string | null; plan_id: string | null }>(),
    db()
      .prepare("SELECT id, no, amount, balance_used, method, status, plan_id, marzban_username, created_at, paid_at FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 50")
      .bind(id)
      .all<{ id: number; no: string | null; amount: number; balance_used: number; method: string; status: string; plan_id: string | null; marzban_username: string | null; created_at: number; paid_at: number | null }>(),
    db()
      .prepare(
        "SELECT b.id, b.amount, b.kind, b.order_id, o.no AS order_no, b.note, b.created_at FROM balance_entries b LEFT JOIN orders o ON o.id = b.order_id WHERE b.customer_id = ? ORDER BY b.id DESC LIMIT 50",
      )
      .bind(id)
      .all<{ id: number; amount: number; kind: string; order_id: number | null; order_no: string | null; note: string | null; created_at: number }>(),
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
          `SELECT w.marzban_username FROM marzban_users w
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
    [t("邮箱", "Email"), c.email],
    [t("微信号", "WeChat"), c.wechat ?? <span className="text-base-content/50">{t("没填（老账号）", "Not set (old account)")}</span>],
    [t("注册", "Joined"), formatExpire(c.created_at, lang, tz)],
    [t("推荐码", "Referral code"), <span className="font-mono">{c.referral_code}</span>],
    [t("推荐人", "Referrer"), c.referrer_id ? <CustomerLink id={c.referrer_id} email={c.referrer ?? ""} /> : t("无", "None")],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <Link href="/admin/customers" className="link link-hover text-sm text-base-content/60">
        ← {t("客人列表", "Customers")}
      </Link>

      <div className="mt-2 mb-4 rounded-box bg-base-100 p-4 shadow-sm">
        <h1 className="text-2xl font-bold">
          {c.wechat ?? c.email}
          <CopyButton text={c.wechat ?? c.email} label={c.wechat ? t("复制微信号", "Copy WeChat ID") : t("复制邮箱", "Copy email")} />
          {c.wechat && (
            <span className="ml-1 align-middle text-sm font-normal text-base-content/60">
              {c.email}
              <CopyButton text={c.email} label={t("复制邮箱", "Copy email")} />
            </span>
          )}
          {c.deleted_at && <span className="badge badge-error badge-soft ml-2 align-middle">{t("已删除", "Deleted")} {formatExpire(c.deleted_at, lang, tz)}</span>}
        </h1>
        <div className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {info.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className={`${lang === "en" ? "w-24" : "w-14"} shrink-0 text-base-content/60`}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-box bg-base-200 p-2">
            <div className="text-xs text-base-content/60">{t("余额", "Balance")}</div>
            <div className="font-bold">{money(totals?.balance ?? 0)}</div>
          </div>
          <div className="rounded-box bg-base-200 p-2">
            <div className="text-xs text-base-content/60">{t("累计付款", "Total paid")}</div>
            <div className="font-bold">
              {money(totals?.paid ?? 0)}
              <span className="ml-1 text-xs font-normal text-base-content/60">{t(`${totals?.paid_n ?? 0} 单`, `${totals?.paid_n ?? 0} orders`)}</span>
            </div>
          </div>
          <div className="rounded-box bg-base-200 p-2">
            <div className="text-xs text-base-content/60">{t("推荐了", "Referred")}</div>
            <div className="font-bold">{t(`${referred.results.length} 人`, `${referred.results.length}`)}</div>
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t(`订阅（${users.length}）`, `Subscriptions (${users.length})`)}</h2>
        <Link href={`/admin/users/new?customer=${encodeURIComponent(c.wechat ?? c.email)}`} className="btn btn-ghost btn-xs font-normal text-base-content/60">
          + {t("新开订阅", "New subscription")}
        </Link>
      </div>
      {maybe.length > 0 && (
        <div role="alert" className="alert alert-info alert-soft mb-3 flex-wrap" data-testid="maybe-subs">
          <span>{t("微信号一样的老订阅，多半是他的：", "Legacy subscriptions with the same WeChat ID, probably theirs:")}</span>
          {maybe.map((m) => (
            <span key={m.marzban_username} className="flex items-center gap-1">
              <SubLink username={m.marzban_username} />
              <BindButton customerId={c.id} username={m.marzban_username} who={c.wechat ?? c.email} />
            </span>
          ))}
        </div>
      )}
      {users.length === 0 && <p className="mb-2 text-sm text-base-content/60">{t("名下还没有订阅。可以新开一个，或者在下面把 Marzban 上已有的订阅绑过来。", "No subscriptions yet. Create one, or link an existing Marzban subscription below.")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {users.map(({ username, code, plan, user }) => {
          const st = user ? statusLabel(user.status, lang) : null;
          const pct = user?.data_limit ? Math.min(100, (user.used_traffic / user.data_limit) * 100) : null;
          const left = user ? timeLeft(user.expire, undefined, lang) : null;
          return (
            <Link
              key={username}
              href={`/admin/users/${encodeURIComponent(username)}`}
              className="rounded-box bg-base-100 p-4 shadow-sm transition hover:shadow-md"
              data-testid="customer-sub"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold">{username}</span>
                {st ? <span className={`badge badge-sm ${st.badge}`}>{st.text}</span> : <span className="badge badge-sm badge-error">{t("Marzban 上查不到", "Not found on Marzban")}</span>}
              </div>
              <div className="text-xs text-base-content/50">
                {plan ?? t("没记套餐", "No plan recorded")}｜{t("订阅编号", "Code")} {formatSubCode(code)}
              </div>
              {user && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-base-content/60">{t("到期", "Expires")}</div>
                    <div>{formatExpire(user.expire, lang, tz)}</div>
                    {left && <div className={`text-xs ${left.urgent ? "text-error" : "text-base-content/60"}`}>{left.text}</div>}
                  </div>
                  <div>
                    <div className="text-xs text-base-content/60">{t("流量", "Traffic")}</div>
                    <div>
                      {formatBytes(user.used_traffic)} / {user.data_limit ? formatBytes(user.data_limit) : t("不限", "Unlimited")}
                    </div>
                    {pct !== null && <progress className={`progress h-1.5 w-full ${pct >= 90 ? "progress-error" : "progress-primary"}`} value={pct} max={100} />}
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {!c.deleted_at && (
        <>
          <h2 className="mt-8 mb-2 text-lg font-bold">{t("操作", "Actions")}</h2>
          <CustomerActions customerId={c.id} email={c.email} />
        </>
      )}

      <div className="mt-8 mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold">{t(`订单（${orders.results.length}）`, `Orders (${orders.results.length})`)}</h2>
        <Link href={`/admin?view=all&q=${encodeURIComponent(c.email)}`} className="link link-hover text-sm">
          {t("在订单页里看", "View in Orders")}
        </Link>
      </div>
      {orders.results.length === 0 ? (
        <p className="text-sm text-base-content/60">{t("没有订单。", "No orders.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>{t("订单", "Order")}</th>
                <th>{t("套餐", "Plan")}</th>
                <th className="text-right">{t("金额", "Amount")}</th>
                <th>{t("怎么付", "Payment")}</th>
                <th>{t("订阅", "Subscription")}</th>
                <th>{t("状态", "Status")}</th>
                <th>{t("时间", "Time")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.results.map((o) => (
                <tr key={o.id}>
                  <td className="font-mono whitespace-nowrap">
                    <Link href={`/admin?view=all&q=${o.no ?? o.id}`} className="link link-hover">
                      {formatOrderNo(o.no)}
                    </Link>
                  </td>
                  <td>{o.plan_id ? (findPlan(site.plans, o.plan_id)?.name ?? o.plan_id) : t("只记账", "Ledger only")}</td>
                  <td className="text-right whitespace-nowrap">
                    {money(o.amount)}
                    {o.balance_used > 0 && o.method === "transfer" && <div className="text-xs text-base-content/50">{t(`余额抵扣 ${money(o.balance_used)}`, `${money(o.balance_used)} from balance`)}</div>}
                  </td>
                  <td>{ORDER_METHOD[o.method] ?? o.method}</td>
                  <td>{o.marzban_username ? <SubLink username={o.marzban_username} /> : "-"}</td>
                  <td>
                    <span className={`badge badge-sm ${ORDER_STATUS[o.status]?.badge ?? "badge-ghost"}`}>{ORDER_STATUS[o.status]?.text ?? o.status}</span>
                  </td>
                  <td className="whitespace-nowrap text-base-content/60">{formatExpire(o.paid_at ?? o.created_at, lang, tz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 mb-2 text-lg font-bold">{t("余额明细", "Balance history")}</h2>
      {entries.results.length === 0 ? (
        <p className="text-sm text-base-content/60">{t("没有记录。", "No entries.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
          <table className="table table-sm">
            <tbody>
              {entries.results.map((e) => (
                <tr key={e.id}>
                  <td>
                    {KIND[e.kind] ?? e.kind}
                    {e.order_id ? t(`（订单 ${formatOrderNo(e.order_no)}）`, ` (order ${formatOrderNo(e.order_no)})`) : ""}
                    {e.note ? t(`：${e.note}`, `: ${e.note}`) : ""}
                  </td>
                  <td className={`text-right whitespace-nowrap ${e.amount >= 0 ? "text-success" : "text-error"}`}>
                    {e.amount >= 0 ? "+" : "-"}
                    {money(Math.abs(e.amount))}
                  </td>
                  <td className="whitespace-nowrap text-base-content/60">{formatExpire(e.created_at, lang, tz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 mb-2 text-lg font-bold">{t(`推荐的人（${referred.results.length}）`, `Referred (${referred.results.length})`)}</h2>
      {referred.results.length === 0 ? (
        <p className="text-sm text-base-content/60">{t("还没推荐过人。", "Hasn't referred anyone yet.")}</p>
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
                    {t("已给这位客人返", "Earned")} <b className="text-success">{money(r.earned)}</b>
                  </td>
                  <td className="whitespace-nowrap text-base-content/60">{t(`${formatDate(r.created_at, lang, tz)} 注册`, `joined ${formatDate(r.created_at, lang, tz)}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!c.deleted_at && (
        <div className="mt-10">
          <DeleteCustomer customerId={c.id} email={c.email} subs={users.map((u) => u.username)} />
        </div>
      )}
    </div>
  );
}
