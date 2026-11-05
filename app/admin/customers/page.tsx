import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatDate, formatMoney, normalizeSubCode } from "@/lib/format";
import { site } from "@/site.config";
import AdminHeader from "../AdminHeader";
import { CustomerLink, SubLink } from "../Links";
import BindButton from "../BindButton";
import { FilterBar, Pager, pageOf, param } from "../ui";
import { getTz } from "@/lib/tz-server";
import { getT } from "@/lib/lang";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Row = { id: number; email: string; wechat: string | null; created_at: number; referrer: string | null; referrer_id: number | null; sub_names: string | null; balance: number; paid: number };

const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
// LIKE 里 % 和 _ 是通配符，客人搜的字里有这两个要转义
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// 客人列表：按邮箱、微信号、订阅名或订阅编号搜，最多显示 100 个，新注册的在前
const PAGE_SIZE = 30;
const SORTS: Record<string, { label: (t: T) => string; sql: string }> = {
  new: { label: (t) => t("最新注册的在前", "Newest first"), sql: "c.id DESC" },
  paid: { label: (t) => t("付款最多的在前", "Most paid first"), sql: "paid DESC, c.id DESC" },
  balance: { label: (t) => t("余额最多的在前", "Highest balance first"), sql: "balance DESC, c.id DESC" },
};
const HAS: Record<string, { label: (t: T) => string; sql: string }> = {
  sub: { label: (t) => t("有订阅", "Has a subscription"), sql: "EXISTS (SELECT 1 FROM subscriptions s WHERE s.customer_id = c.id)" },
  nosub: { label: (t) => t("没有订阅", "No subscription"), sql: "NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.customer_id = c.id)" },
  balance: { label: (t) => t("有余额", "Has balance"), sql: "(SELECT COALESCE(SUM(amount), 0) FROM balance_entries b WHERE b.customer_id = c.id) > 0" },
  referred: { label: (t) => t("别人推荐来的", "Referred"), sql: "c.referred_by IS NOT NULL" },
  nowechat: { label: (t) => t("没填微信号", "No WeChat ID"), sql: "c.wechat IS NULL" },
  deleted: { label: (t) => t("已删除的", "Deleted"), sql: "c.deleted_at IS NOT NULL" },
};

// 客人列表：搜邮箱、微信号、订阅名或订阅编号，按有没有订阅 / 余额 / 推荐人筛，排序、翻页。
// 下面是还没注册网站账号的老客人（按微信号对上他们的老订阅）
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const tz = await getTz();
  const { t, lang } = await getT();
  const sp = await searchParams;
  const query = param(sp, "q");
  const has = param(sp, "has") in HAS ? param(sp, "has") : "";
  const sort = param(sp, "sort") in SORTS ? param(sp, "sort") : "new";
  const page = pageOf(sp);
  const where = `(?1 = '' OR c.email LIKE ?2 ESCAPE '\\' OR c.wechat LIKE ?2 ESCAPE '\\' OR c.id IN (SELECT customer_id FROM subscriptions WHERE marzban_username LIKE ?2 ESCAPE '\\' OR code = ?3))${has ? ` AND ${HAS[has].sql}` : ""}${has === "deleted" ? "" : " AND c.deleted_at IS NULL"}`;
  const binds = [query, like(query), normalizeSubCode(query)];
  const total = await db().prepare(`SELECT COUNT(*) AS n FROM customers c WHERE ${where}`).bind(...binds).first<{ n: number }>();
  const { results } = await db()
    .prepare(
      `SELECT c.id, c.email, c.wechat, c.created_at, r.email AS referrer, r.id AS referrer_id,
         (SELECT GROUP_CONCAT(marzban_username) FROM subscriptions s WHERE s.customer_id = c.id) AS sub_names,
         (SELECT COALESCE(SUM(amount), 0) FROM balance_entries b WHERE b.customer_id = c.id) AS balance,
         (SELECT COALESCE(SUM(amount), 0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'paid') AS paid
       FROM customers c LEFT JOIN customers r ON r.id = c.referred_by
       WHERE ${where}
       ORDER BY ${SORTS[sort].sql} LIMIT ?4 OFFSET ?5`,
    )
    .bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE)
    .all<Row>();
  // 老订阅：绑没绑、绑在谁名下；没绑的看有没有同微信号的注册客人（不分大小写），给一键绑定
  const { results: legacy } = await db()
    .prepare(
      `SELECT w.marzban_username, w.wechat, c.id AS customer_id, c.email, c.wechat AS customer_wechat, m.id AS match_id, m.email AS match_email
       FROM marzban_users w
       LEFT JOIN subscriptions s ON s.marzban_username = w.marzban_username
       LEFT JOIN customers c ON c.id = s.customer_id
       -- 同微信号的注册客人可能不止一个（微信号没限制唯一），取最早注册的那个
       LEFT JOIN customers m ON s.id IS NULL AND m.id = (SELECT id FROM customers x WHERE x.wechat = w.wechat COLLATE NOCASE ORDER BY id LIMIT 1)
       WHERE w.wechat IS NOT NULL AND (?1 = '' OR w.marzban_username LIKE ?2 ESCAPE '\\' OR w.wechat LIKE ?2 ESCAPE '\\')
       ORDER BY c.id IS NOT NULL, w.wechat COLLATE NOCASE, w.marzban_username LIMIT 200`,
    )
    .bind(query, like(query))
    .all<{ marzban_username: string; wechat: string; customer_id: number | null; email: string | null; customer_wechat: string | null; match_id: number | null; match_email: string | null }>();
  const params = { q: query, has, sort: sort === "new" ? "" : sort };
  // 老订阅按微信号合成「人」：同一个微信号的几个订阅放一行
  const people = new Map<string, { wechat: string; subs: typeof legacy }>();
  for (const w of legacy) {
    const key = w.wechat.toLowerCase();
    if (!people.has(key)) people.set(key, { wechat: w.wechat, subs: [] });
    people.get(key)!.subs.push(w);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <div className="mt-4 mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("客人", "Customers")}</h1>
        <span className="text-sm text-base-content/60">
          {t("在网站上注册的人；每个客人名下可以有好几个订阅（Marzban 用户）", "People registered on the site; each can have several subscriptions (Marzban users)")}
        </span>
      </div>
      <FilterBar base="/admin/customers" active={!!(query || has || sort !== "new")}>
        <input name="q" defaultValue={query} placeholder={t("邮箱、微信号、订阅名或订阅编号", "Email, WeChat ID, subscription name or code")} className="input input-sm w-64" />
        <select name="has" defaultValue={has} className="select select-sm w-36" aria-label={t("筛选", "Filter")}>
          <option value="">{t("全部客人", "All customers")}</option>
          {Object.entries(HAS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label(t)}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className="select select-sm w-40" aria-label={t("排序", "Sort")}>
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label(t)}
            </option>
          ))}
        </select>
      </FilterBar>
      {results.length === 0 ? (
        <p className="text-base-content/60">{query ? t("没有找到注册过的客人。", "No registered customers found.") : t("还没有客人。", "No customers yet.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>{t("客人", "Customer")}</th>
                <th>{t("订阅", "Subscriptions")}</th>
                <th className="text-right">{t("余额", "Balance")}</th>
                <th className="text-right">{t("累计付款", "Total paid")}</th>
                <th>{t("推荐人", "Referrer")}</th>
                <th>{t("注册", "Joined")}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((c) => {
                const names = c.sub_names ? c.sub_names.split(",") : [];
                return (
                  <tr key={c.id} className="hover">
                    <td>
                      <CustomerLink id={c.id} email={c.email} wechat={c.wechat} />
                    </td>
                    <td>
                      {names.length === 0 ? (
                        <span className="text-base-content/40">{t("没有", "None")}</span>
                      ) : (
                        <span className="flex flex-wrap gap-x-2">
                          {names.slice(0, 3).map((n) => (
                            <SubLink key={n} username={n} />
                          ))}
                          {names.length > 3 && <span className="text-base-content/50">{t(`等 ${names.length} 个`, `${names.length} total`)}</span>}
                        </span>
                      )}
                    </td>
                    <td className="text-right">{money(c.balance)}</td>
                    <td className="text-right">{money(c.paid)}</td>
                    <td>{c.referrer_id ? <CustomerLink id={c.referrer_id} email={c.referrer ?? ""} /> : <span className="text-base-content/40">-</span>}</td>
                    <td className="whitespace-nowrap text-base-content/60">{formatDate(c.created_at, lang, tz)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager base="/admin/customers" params={params} page={page} pageSize={PAGE_SIZE} total={total?.n ?? 0} />
      {people.size > 0 && (
        <>
          <h2 className="mt-10 mb-1 text-lg font-bold">{t("老客人（portal 上线前开的订阅）", "Legacy customers (subscriptions from before the portal)")}</h2>
          <p className="mb-3 text-sm text-base-content/60">
            {t(
              "按微信号就知道是谁：一个微信号一行，名下的老订阅都列在后面。客人注册网站账号时填的微信号一样，就会出现「绑定」按钮，点一下他就能在网站上看到、续费。不自动绑：微信号别人也能填，要你确认是本人。",
              "One row per WeChat ID, with its legacy subscriptions. When someone registers with the same WeChat ID, a “Link” button appears; one tap lets them see and renew it on the site. Not linked automatically: anyone can type a WeChat ID, so you confirm it's really them.",
            )}
          </p>
          <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>{t("客人（微信号）", "Customer (WeChat ID)")}</th>
                  <th>{t("订阅和网站账号", "Subscriptions & site account")}</th>
                </tr>
              </thead>
              <tbody>
                {[...people.values()].map((p) => (
                  <tr key={p.wechat} data-testid="legacy-person">
                    <td className="align-top font-medium">{p.wechat}</td>
                    <td>
                      <div className="flex flex-col gap-1">
                        {p.subs.map((w) => (
                          <div key={w.marzban_username} className="flex flex-wrap items-center gap-2" data-testid="legacy-sub">
                            <SubLink username={w.marzban_username} />
                            {w.customer_id ? (
                              <>
                                <span className="badge badge-sm badge-success">{t("已绑定", "Linked")}</span>
                                <CustomerLink id={w.customer_id} email={w.email ?? ""} wechat={w.customer_wechat} />
                              </>
                            ) : w.match_id ? (
                              <>
                                <span className="text-sm text-base-content/60">{t("同微信号的客人", "Customer with same WeChat ID")}</span>
                                <CustomerLink id={w.match_id} email={w.match_email ?? ""} />
                                <BindButton customerId={w.match_id} username={w.marzban_username} who={w.match_email ?? ""} />
                              </>
                            ) : (
                              <span className="text-sm text-base-content/50">{t("还没注册网站账号", "No site account yet")}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
