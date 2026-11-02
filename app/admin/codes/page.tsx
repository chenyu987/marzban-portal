import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatExpire, formatMoney, formatRedeemCode } from "@/lib/format";
import { findPlan } from "@/lib/plans";
import { site } from "@/site.config";
import AdminHeader from "../AdminHeader";
import { CreateCodes, VoidCode } from "./CodeForms";
import { CustomerLink } from "../Links";
import { FilterBar, Pager, pageOf, param } from "../ui";

export const dynamic = "force-dynamic";

type Row = {
  code: string;
  plan_id: string;
  note: string | null;
  used_by: number | null;
  used_at: number | null;
  order_id: number | null;
  email: string | null;
  wechat: string | null;
  created_at: number;
};

const PAGE_SIZE = 50;
const STATES: Record<string, { label: string; sql: string }> = {
  unused: { label: "没用过", sql: "r.used_by IS NULL" },
  used: { label: "已用", sql: "r.used_by IS NOT NULL AND r.order_id IS NOT NULL" },
  stuck: { label: "卡住了，要核对", sql: "r.used_by IS NOT NULL AND r.order_id IS NULL" },
};
const GROUPS = [...new Set(site.plans.map((p) => p.group ?? p.name))];
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// 兑换码：生成；按状态（没用过 / 已用 / 卡住）、套餐、码 / 备注 / 客人搜；作废没用过的
export default async function CodesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  // 兼容以前的 ?unused=1
  const state = param(sp, "unused") === "1" ? "unused" : param(sp, "state") in STATES ? param(sp, "state") : "";
  const group = GROUPS.includes(param(sp, "plan")) ? param(sp, "plan") : "";
  const q = param(sp, "q");
  const page = pageOf(sp);
  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (state) where.push(STATES[state].sql);
  if (group) {
    const ids = site.plans.filter((p) => (p.group ?? p.name) === group).map((p) => p.id);
    where.push(`r.plan_id IN (${ids.map(() => "?").join(",")})`);
    binds.push(...ids);
  }
  if (q) {
    where.push("(r.code LIKE ? ESCAPE '\\' OR r.note LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.wechat LIKE ? ESCAPE '\\')");
    const code = q.replace(/[^0-9a-z]/gi, "").toUpperCase();
    binds.push(like(code || q), like(q), like(q), like(q));
  }
  const W = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const FROM = "FROM redeem_codes r LEFT JOIN customers c ON c.id = r.used_by";
  const [count, { results }] = await Promise.all([
    db().prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(r.used_by IS NULL), 0) AS unused ${FROM} ${W}`).bind(...binds).first<{ n: number; unused: number }>(),
    db()
      .prepare(`SELECT r.code, r.plan_id, r.note, r.used_by, r.used_at, r.order_id, c.email, c.wechat, r.created_at ${FROM} ${W} ORDER BY r.created_at DESC, r.code LIMIT ? OFFSET ?`)
      .bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .all<Row>(),
  ]);
  const plans = site.plans.map((p) => ({ id: p.id, name: p.name, price: `${site.currency}${formatMoney(p.price)}` }));
  const params = { state, plan: group, q };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <h1 className="mt-4 mb-4 text-2xl font-bold">兑换码</h1>
      <CreateCodes plans={plans} />

      <h2 className="mt-8 mb-2 text-lg font-bold">
        兑换码 <span className="text-sm font-normal text-base-content/60">（筛出 {count?.n ?? 0} 个，其中没用过 {count?.unused ?? 0} 个）</span>
      </h2>
      <FilterBar base="/admin/codes" active={!!(state || group || q)}>
        <input name="q" defaultValue={q} placeholder="兑换码、备注、客人" className="input input-sm w-52" />
        <select name="state" defaultValue={state} className="select select-sm w-40" aria-label="状态">
          <option value="">全部状态</option>
          {Object.entries(STATES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
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
      </FilterBar>
      {results.length === 0 && <p className="text-sm text-base-content/60">没有。</p>}
      <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>兑换码</th>
              <th>套餐</th>
              <th>备注</th>
              <th>状态</th>
              <th>生成</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const label = formatRedeemCode(r.code);
              return (
                <tr key={r.code}>
                  <td className="font-mono">{label}</td>
                  <td>{findPlan(site.plans, r.plan_id)?.name ?? `${r.plan_id}（已下架）`}</td>
                  <td className="text-base-content/60">{r.note ?? ""}</td>
                  <td>
                    {r.used_by === null ? (
                      <span className="flex items-center gap-1">
                        <span className="badge badge-sm badge-success">没用过</span>
                        <VoidCode code={r.code} label={label} />
                      </span>
                    ) : r.order_id === null ? (
                      // 占住了但没记账：兑换时 Marzban 出了问题，要去核对（见 docs/portal-deploy.md「兑换码卡住了」）
                      <span className="badge badge-sm badge-error">卡住了，要核对</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1 text-sm">
                        {r.email ? <CustomerLink id={r.used_by} email={r.email} wechat={r.wechat} /> : `客人 ${r.used_by}`}
                        <span className="text-base-content/60">{formatExpire(r.used_at)} 用的，</span>
                        <Link href={`/admin?view=all&q=${r.order_id}`} className="link link-hover">
                          订单 {r.order_id}
                        </Link>
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-base-content/60">{formatExpire(r.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager base="/admin/codes" params={params} page={page} pageSize={PAGE_SIZE} total={count?.n ?? 0} />
    </div>
  );
}
