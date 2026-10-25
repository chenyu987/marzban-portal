import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { site } from "@/site.config";
import AdminHeader from "../AdminHeader";

export const dynamic = "force-dynamic";

type Row = { id: number; email: string; created_at: number; referrer: string | null; subs: number; balance: number; paid: number };

const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
// LIKE 里 % 和 _ 是通配符，客人搜的字里有这两个要转义
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// 客人列表：按邮箱或 Marzban 用户名搜，最多显示 100 个，新注册的在前
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const admin = await requireAdmin();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const { results } = await db()
    .prepare(
      `SELECT c.id, c.email, c.created_at, r.email AS referrer,
         (SELECT COUNT(*) FROM subscriptions s WHERE s.customer_id = c.id) AS subs,
         (SELECT COALESCE(SUM(amount), 0) FROM balance_entries b WHERE b.customer_id = c.id) AS balance,
         (SELECT COALESCE(SUM(amount), 0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'paid') AS paid
       FROM customers c LEFT JOIN customers r ON r.id = c.referred_by
       WHERE ?1 = '' OR c.email LIKE ?2 ESCAPE '\\' OR c.id IN (SELECT customer_id FROM subscriptions WHERE marzban_username LIKE ?2 ESCAPE '\\')
       ORDER BY c.id DESC LIMIT 100`,
    )
    .bind(query, like(query))
    .all<Row>();

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <h1 className="mt-4 mb-4 text-2xl font-bold">客人</h1>
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={query} placeholder="邮箱或 Marzban 用户名" className="input w-full" />
        <button className="btn">搜索</button>
      </form>
      {results.length === 0 ? (
        <p className="text-base-content/60">{query ? "没有找到。" : "还没有客人。"}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>邮箱</th>
                <th>注册</th>
                <th>订阅</th>
                <th>余额</th>
                <th>已付款</th>
                <th>推荐人</th>
              </tr>
            </thead>
            <tbody>
              {results.map((c) => (
                <tr key={c.id} className="hover">
                  <td>
                    <Link href={`/admin/customers/${c.id}`} className="link link-primary">
                      {c.email}
                    </Link>
                  </td>
                  <td>{formatDate(c.created_at)}</td>
                  <td>{c.subs}</td>
                  <td>{money(c.balance)}</td>
                  <td>{money(c.paid)}</td>
                  <td className="text-base-content/60">{c.referrer ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.length === 100 && <p className="mt-2 text-sm text-base-content/60">只显示最近 100 个，用搜索找更早的。</p>}
        </div>
      )}
    </div>
  );
}
