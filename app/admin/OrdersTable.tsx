import { db } from "@/lib/env";
import { formatExpire, formatMoney } from "@/lib/format";
import { fromBeijingInput } from "@/lib/admin-users";
import { site } from "@/site.config";
import { CustomerLink, SubLink } from "./Links";
import { FilterBar, ORDER_METHOD, ORDER_STATUS, Pager, pageOf, param } from "./ui";

const PAGE_SIZE = 30;
const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

type Row = {
  id: number;
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
const planName = (id: string | null) => (id ? (site.plans.find((p) => p.id === id)?.name ?? `${id}（已下架）`) : "只记账");

// 全部订单：搜订单号 / 客人 / 订阅 / 付款人，按状态、怎么付、套餐、下单日期筛，翻页；顶上汇总筛出来的单
export default async function OrdersTable({ sp }: { sp: Record<string, string | string[] | undefined> }) {
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
    if (/^\d+$/.test(q)) {
      where.push("o.id = ?");
      binds.push(Number(q));
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
        `SELECT o.id, c.id AS customer_id, c.email, c.wechat, o.amount, o.balance_used, o.method, o.status, o.plan_id, o.marzban_username,
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
        <input name="q" defaultValue={q} placeholder="订单号、客人、订阅、付款人" className="input input-sm w-52" />
        <select name="status" defaultValue={status} className="select select-sm w-36" aria-label="状态">
          <option value="">全部状态</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.text}
            </option>
          ))}
        </select>
        <select name="method" defaultValue={method} className="select select-sm w-32" aria-label="怎么付">
          <option value="">全部付款方式</option>
          {Object.entries(ORDER_METHOD).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="plan" defaultValue={group} className="select select-sm w-36" aria-label="套餐">
          <option value="">全部套餐</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-base-content/60">
          下单
          <input type="date" name="from" defaultValue={from} className="input input-sm w-36" aria-label="从" />
          到
          <input type="date" name="to" defaultValue={to} className="input input-sm w-36" aria-label="到" />
        </label>
      </FilterBar>

      <div className="mb-2 flex flex-wrap gap-4 text-sm" data-testid="orders-summary">
        <span>
          筛出 <b>{sum?.n ?? 0}</b> 单
        </span>
        <span>
          其中已付款 <b>{sum?.paid_n ?? 0}</b> 单，共 <b className="text-success">{money(sum?.paid ?? 0)}</b>
        </span>
      </div>

      <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>订单</th>
              <th>下单时间</th>
              <th>客人</th>
              <th>套餐</th>
              <th>订阅</th>
              <th className="text-right">金额</th>
              <th>怎么付</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.results.map((o) => {
              const st = ORDER_STATUS[o.status] ?? { text: o.status, badge: "badge-ghost" };
              return (
                <tr key={o.id} className="hover" data-testid="order-row">
                  <td className="font-mono">{o.id}</td>
                  <td className="whitespace-nowrap text-base-content/70">{formatExpire(o.created_at)}</td>
                  <td>
                    <CustomerLink id={o.customer_id} email={o.email} wechat={o.wechat} />
                  </td>
                  <td className="whitespace-nowrap">{planName(o.plan_id)}</td>
                  <td>{o.marzban_username ? <SubLink username={o.marzban_username} /> : <span className="text-base-content/40">新开</span>}</td>
                  <td className="text-right whitespace-nowrap">
                    {money(o.amount)}
                    {o.balance_used > 0 && <div className="text-xs text-base-content/50">余额抵 {money(o.balance_used)}</div>}
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
                    {o.status === "paid" && o.method === "transfer" && !o.verified_at && <span className="badge badge-sm badge-info ml-1">待对账</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.results.length === 0 && <p className="p-4 text-sm text-base-content/60">{active ? "没有符合条件的订单。" : "还没有订单。"}</p>}
      </div>
      <Pager base="/admin" params={params} page={page} pageSize={PAGE_SIZE} total={sum?.n ?? 0} />
    </>
  );
}
