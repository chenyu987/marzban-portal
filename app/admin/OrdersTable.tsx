import { db } from "@/lib/env";
import ResizableTable from "./ResizableTable";
import { formatExpire, formatMoney, formatOrderNo, parseOrderNo } from "@/lib/format";
import { fromBeijingInput } from "@/lib/admin-users";
import { site } from "@/site.config";
import { CustomerLink, SubLink } from "./Links";
import { FilterBar, orderMethod, orderStatus, Pager, pageOf, param } from "./ui";
import { getTz } from "@/lib/tz-server";
import { getT } from "@/lib/lang";
import type { Lang, T } from "@/lib/i18n";
import { groupName, planName as planLabel } from "@/lib/plan-text";

const PAGE_SIZE = 30;
const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

type Row = {
  id: number;
  no: string | null;
  customer_id: number;
  email: string;
  wechat: string | null;
  amount: number;
  balance_used: number;
  method: string;
  status: string;
  plan_id: string | null;
  marzban_username: string | null;
  pay_method: string | null;
  payer: string | null;
  verified_at: number | null;
  paid_at: number | null;
  created_at: number;
};

// 套餐按档位筛（同一档的月付、季付……一起），档位名就是 Plan.group
const GROUPS = [...new Set(site.plans.map((p) => p.group ?? p.name))];
const planIdsOf = (group: string) => site.plans.filter((p) => (p.group ?? p.name) === group).map((p) => p.id);
const planName = (t: T, lang: Lang, id: string | null) => {
  const p = id ? site.plans.find((x) => x.id === id) : undefined;
  if (p) return planLabel(p, lang);
  return id ? t(`${id}（已下架）`, `${id} (retired)`) : t("只记账", "Ledger only");
};

// 全部订单：搜订单号 / 客人 / 订阅 / 付款人，按状态、怎么付、套餐、下单日期筛，翻页；顶上汇总筛出来的单
export default async function OrdersTable({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const tz = await getTz();
  const { t, lang } = await getT();
  const ORDER_STATUS = orderStatus(t);
  const ORDER_METHOD = orderMethod(t);
  const q = param(sp, "q");
  const status = param(sp, "status") in ORDER_STATUS ? param(sp, "status") : "";
  const method = param(sp, "method") in ORDER_METHOD ? param(sp, "method") : "";
  const group = GROUPS.includes(param(sp, "plan")) ? param(sp, "plan") : "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "from")) ? param(sp, "from") : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "to")) ? param(sp, "to") : "";
  const page = pageOf(sp);

  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (q) {
    const no = parseOrderNo(q);
    if (no) {
      where.push("o.no = ?");
      binds.push(no);
    } else if (/^\d+$/.test(q)) {
      // 纯数字但不像订单号：可能是订单号的一部分（比如日期 261103），也可能是内部 id
      where.push("(o.no LIKE ? OR o.id = ?)");
      binds.push(`%${q}%`, Number(q));
    } else {
      where.push("(c.email LIKE ? ESCAPE '\\' OR c.wechat LIKE ? ESCAPE '\\' OR o.marzban_username LIKE ? ESCAPE '\\' OR o.payer LIKE ? ESCAPE '\\')");
      binds.push(like(q), like(q), like(q), like(q));
    }
  }
  if (status) {
    where.push("o.status = ?");
    binds.push(status);
  }
  if (method) {
    where.push("o.method = ?");
    binds.push(method);
  }
  if (group) {
    const ids = planIdsOf(group);
    where.push(`o.plan_id IN (${ids.map(() => "?").join(",")})`);
    binds.push(...ids);
  }
  if (from) {
    where.push("o.created_at >= ?");
    binds.push(fromBeijingInput(`${from}T00:00`)!);
  }
  if (to) {
    where.push("o.created_at < ?");
    binds.push(fromBeijingInput(`${to}T00:00`)! + 86400);
  }
  const W = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const FROM = "FROM orders o JOIN customers c ON c.id = o.customer_id";

  const [sum, rows] = await Promise.all([
    db()
      .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN o.status = 'paid' THEN o.amount END), 0) AS paid, COALESCE(SUM(o.status = 'paid'), 0) AS paid_n ${FROM} ${W}`)
      .bind(...binds)
      .first<{ n: number; paid: number; paid_n: number }>(),
    db()
      .prepare(
        `SELECT o.id, o.no, c.id AS customer_id, c.email, c.wechat, o.amount, o.balance_used, o.method, o.status, o.plan_id, o.marzban_username,
           o.pay_method, o.payer, o.verified_at, o.paid_at, o.created_at ${FROM} ${W} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .all<Row>(),
  ]);
  const params = { view: "all", q, status, method, plan: group, from, to };
  const active = !!(q || status || method || group || from || to);

  return (
    <>
      <FilterBar base="/admin?view=all" active={active}>
        <input type="hidden" name="view" value="all" />
        <input name="q" defaultValue={q} placeholder={t("订单号、客人、订阅、付款人", "Order no., customer, subscription, payer")} className="input input-sm w-52" />
        <select name="status" defaultValue={status} className="select select-sm w-36" aria-label={t("状态", "Status")}>
          <option value="">{t("全部状态", "All statuses")}</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.text}
            </option>
          ))}
        </select>
        <select name="method" defaultValue={method} className="select select-sm w-32" aria-label={t("怎么付", "Payment")}>
          <option value="">{t("全部付款方式", "All payment types")}</option>
          {Object.entries(ORDER_METHOD).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="plan" defaultValue={group} className="select select-sm w-36" aria-label={t("套餐", "Plan")}>
          <option value="">{t("全部套餐", "All plans")}</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {groupName(g, lang)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-base-content/60">
          {t("下单", "Ordered")}
          <input type="date" name="from" defaultValue={from} className="input input-sm w-36" aria-label={t("从", "From")} />
          {t("到", "to")}
          <input type="date" name="to" defaultValue={to} className="input input-sm w-36" aria-label={t("到", "To")} />
        </label>
      </FilterBar>

      <div className="mb-2 flex flex-wrap gap-4 text-sm" data-testid="orders-summary">
        <span>
          {t("筛出", "Found")} <b>{sum?.n ?? 0}</b> {t("单", "orders")}
        </span>
        <span>
          {t("其中已付款", "Paid:")} <b>{sum?.paid_n ?? 0}</b> {t("单，共", "orders, total")} <b className="text-success">{money(sum?.paid ?? 0)}</b>
        </span>
      </div>

      <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
        <ResizableTable id="orders" className="table table-sm">
          <thead>
            <tr>
              <th>{t("订单", "Order")}</th>
              <th>{t("下单时间", "Ordered")}</th>
              <th>{t("微信号", "WeChat")}</th>
              <th>{t("邮箱", "Email")}</th>
              <th>{t("套餐", "Plan")}</th>
              <th>{t("订阅", "Subscription")}</th>
              <th className="text-right">{t("金额", "Amount")}</th>
              <th>{t("怎么付", "Payment")}</th>
              <th>{t("状态", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.results.map((o) => {
              const st = ORDER_STATUS[o.status] ?? { text: o.status, badge: "badge-ghost" };
              return (
                <tr key={o.id} className="hover" data-testid="order-row">
                  <td className="font-mono whitespace-nowrap">{formatOrderNo(o.no)}</td>
                  <td className="whitespace-nowrap text-base-content/70">{formatExpire(o.created_at, lang, tz)}</td>
                  <td>
                    <CustomerLink id={o.customer_id} email={o.email} wechat={o.wechat} part="wechat" />
                  </td>
                  <td>
                    <CustomerLink id={o.customer_id} email={o.email} wechat={o.wechat} part="email" />
                  </td>
                  <td className="whitespace-nowrap">{planName(t, lang, o.plan_id)}</td>
                  <td>{o.marzban_username ? <SubLink username={o.marzban_username} /> : <span className="text-base-content/40">{t("新开", "New")}</span>}</td>
                  <td className="text-right whitespace-nowrap">
                    {money(o.amount)}
                    {o.balance_used > 0 && <div className="text-xs text-base-content/50">{t(`余额抵 ${money(o.balance_used)}`, `${money(o.balance_used)} from balance`)}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    {ORDER_METHOD[o.method] ?? o.method}
                    {(o.pay_method || o.payer) && (
                      <div className="text-xs text-base-content/50">
                        {o.pay_method}
                        {o.payer ? ` · ${o.payer}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <span className={`badge badge-sm ${st.badge}`}>{st.text}</span>
                    {o.status === "paid" && o.method === "transfer" && !o.verified_at && <span className="badge badge-sm badge-info ml-1">{t("待对账", "To reconcile")}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </ResizableTable>
        {rows.results.length === 0 && <p className="p-4 text-sm text-base-content/60">{active ? t("没有符合条件的订单。", "No matching orders.") : t("还没有订单。", "No orders yet.")}</p>}
      </div>
      <Pager base="/admin" params={params} page={page} pageSize={PAGE_SIZE} total={sum?.n ?? 0} />
    </>
  );
}
