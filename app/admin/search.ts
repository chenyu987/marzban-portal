"use server";

// 后台 ⌘K 全局搜索：一个框搜客人（邮箱、微信号）、订阅（用户名、订阅编号，包括没绑客人的 Marzban 用户）、订单号。
// 只读，但照样先过 requireAdmin()
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatOrderNo, formatSubCode, normalizeSubCode } from "@/lib/format";
import { listUsers } from "@/lib/marzban";

export type SearchHit = { group: "客人" | "订阅" | "订单" | "页面"; title: string; sub: string; href: string };

const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function adminSearch(raw: string): Promise<SearchHit[]> {
  await requireAdmin();
  const q = raw.trim().slice(0, 64);
  if (!q) return [];
  const digits = q.replace(/[\s-]/g, "");
  const code = normalizeSubCode(q);

  const [customers, subs, orders, marzban] = await Promise.all([
    db()
      .prepare(
        `SELECT id, email, wechat FROM customers
         WHERE deleted_at IS NULL AND (email LIKE ?1 ESCAPE '\\' OR wechat LIKE ?1 ESCAPE '\\') ORDER BY id DESC LIMIT 6`,
      )
      .bind(like(q))
      .all<{ id: number; email: string; wechat: string | null }>(),
    db()
      .prepare(
        `SELECT s.marzban_username, s.code, c.email, c.wechat FROM subscriptions s JOIN customers c ON c.id = s.customer_id
         WHERE s.marzban_username LIKE ?1 ESCAPE '\\' OR (?2 != '' AND s.code = ?2) ORDER BY s.id DESC LIMIT 6`,
      )
      .bind(like(q), code.length === 8 ? code : "")
      .all<{ marzban_username: string; code: string | null; email: string; wechat: string | null }>(),
    /^\d{3,11}$/.test(digits)
      ? db()
          .prepare(
            `SELECT o.no, o.amount, o.status, c.email, c.wechat FROM orders o JOIN customers c ON c.id = o.customer_id
             WHERE o.no LIKE ? ORDER BY o.id DESC LIMIT 5`,
          )
          .bind(`%${digits}%`)
          .all<{ no: string; amount: number; status: string; email: string; wechat: string | null }>()
      : Promise.resolve({ results: [] as { no: string; amount: number; status: string; email: string; wechat: string | null }[] }),
    // Marzban 上按用户名、备注搜（没绑客人的订阅只在这里有）；面板连不上就少这一块，不影响别的
    listUsers({ offset: 0, limit: 6, search: q }).catch(() => null),
  ]);

  const who = (r: { email: string; wechat: string | null }) => (r.wechat ? `${r.wechat} · ${r.email}` : r.email);
  const hits: SearchHit[] = customers.results.map((c) => ({
    group: "客人",
    title: c.wechat ?? c.email,
    sub: c.wechat ? c.email : "",
    href: `/admin/customers/${c.id}`,
  }));
  const seen = new Set<string>();
  for (const s of subs.results) {
    seen.add(s.marzban_username);
    hits.push({ group: "订阅", title: s.marzban_username, sub: `${formatSubCode(s.code)} · ${who(s)}`, href: `/admin/users/${encodeURIComponent(s.marzban_username)}` });
  }
  for (const u of marzban?.users ?? []) {
    if (seen.has(u.username) || hits.filter((h) => h.group === "订阅").length >= 8) continue;
    hits.push({ group: "订阅", title: u.username, sub: u.note ? `备注 ${u.note}` : "Marzban 用户", href: `/admin/users/${encodeURIComponent(u.username)}` });
  }
  for (const o of orders.results) {
    hits.push({ group: "订单", title: `订单 ${formatOrderNo(o.no)}`, sub: who(o), href: `/admin?view=all&q=${o.no}` });
  }
  return hits;
}
