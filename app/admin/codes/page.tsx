import { withCodeDays } from "@/lib/redeem-codes";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatExpire, formatMoney, formatRedeemCode, formatOrderNo } from "@/lib/format";
import { findPlan } from "@/lib/plans";
import { site } from "@/site.config";
import AdminHeader from "../AdminHeader";
import { CreateCodes, VoidCode } from "./CodeForms";
import { CustomerLink } from "../Links";
import { FilterBar, Pager, pageOf, param } from "../ui";
import { getTz } from "@/lib/tz-server";
import { getT } from "@/lib/lang";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Row = {
  code: string;
  plan_id: string;
  days: number | null;
  note: string | null;
  used_by: number | null;
  used_at: number | null;
  order_id: number | null;
  order_no: string | null;
  email: string | null;
  wechat: string | null;
  created_at: number;
};

const PAGE_SIZE = 50;
// 免费体验（0 元）兑换成功也不记订单（见 app/actions.ts 的 redeem），没有订单号不算卡住
const FREE_IDS = site.plans.filter((p) => p.price === 0).map((p) => p.id);
const FREE_SQL = FREE_IDS.length ? `r.plan_id IN (${FREE_IDS.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")})` : "0";
const STATES: Record<string, { label: (t: T) => string; sql: string }> = {
  unused: { label: (t) => t("没用过", "Unused"), sql: "r.used_by IS NULL" },
  used: { label: (t) => t("已用", "Used"), sql: `r.used_by IS NOT NULL AND (r.order_id IS NOT NULL OR ${FREE_SQL})` },
  stuck: { label: (t) => t("卡住了，要核对", "Stuck, needs checking"), sql: `r.used_by IS NOT NULL AND r.order_id IS NULL AND NOT ${FREE_SQL}` },
};
const GROUPS = [...new Set(site.plans.map((p) => p.group ?? p.name))];
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// 兑换码：生成；按状态（没用过 / 已用 / 卡住）、套餐、码 / 备注 / 客人搜；作废没用过的
export default async function CodesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const tz = await getTz();
  const { t, lang } = await getT();
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
  const FROM = "FROM redeem_codes r LEFT JOIN customers c ON c.id = r.used_by LEFT JOIN orders o ON o.id = r.order_id";
  const [count, { results }] = await Promise.all([
    db().prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(r.used_by IS NULL), 0) AS unused ${FROM} ${W}`).bind(...binds).first<{ n: number; unused: number }>(),
    db()
      .prepare(`SELECT r.code, r.plan_id, r.days, r.note, r.used_by, r.used_at, r.order_id, o.no AS order_no, c.email, c.wechat, r.created_at ${FROM} ${W} ORDER BY r.created_at DESC, r.code LIMIT ? OFFSET ?`)
      .bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .all<Row>(),
  ]);
  // 生成兑换码先选档位（group）再选时长（名字去掉档位剩下的「月付」「7天体验」）
  const plans = site.plans.map((p) => {
    const group = p.group ?? p.name;
    return { id: p.id, name: p.name, group, period: p.name.slice(group.length).trim() || p.name, price: p.price === 0 ? t("免费", "Free") : `${site.currency}${formatMoney(p.price)}`, free: p.price === 0, days: p.days };
  });
  const params = { state, plan: group, q };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <h1 className="mt-4 mb-4 text-2xl font-bold">{t("兑换码", "Redeem codes")}</h1>
      {/* 默认停在第一个 Pro 档位（分档时）：最常发的是它；不分档就是第一个 */}
      <CreateCodes plans={plans} defaultGroup={site.plans.find((p) => p.pro)?.group} />

      <h2 className="mt-8 mb-2 text-lg font-bold">
        {t("兑换码", "Codes")}{" "}
        <span className="text-sm font-normal text-base-content/60">
          {t(`（筛出 ${count?.n ?? 0} 个，其中没用过 ${count?.unused ?? 0} 个）`, `(${count?.n ?? 0} found, ${count?.unused ?? 0} unused)`)}
        </span>
      </h2>
      <FilterBar base="/admin/codes" active={!!(state || group || q)}>
        <input name="q" defaultValue={q} placeholder={t("兑换码、备注、客人", "Code, note, customer")} className="input input-sm w-52" />
        <select name="state" defaultValue={state} className="select select-sm w-40" aria-label={t("状态", "Status")}>
          <option value="">{t("全部状态", "All statuses")}</option>
          {Object.entries(STATES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label(t)}
            </option>
          ))}
        </select>
        <select name="plan" defaultValue={group} className="select select-sm w-36" aria-label={t("套餐", "Plan")}>
          <option value="">{t("全部套餐", "All plans")}</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </FilterBar>
      {results.length === 0 && <p className="text-sm text-base-content/60">{t("没有。", "None.")}</p>}
      <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>{t("兑换码", "Code")}</th>
              <th>{t("套餐", "Plan")}</th>
              <th>{t("备注", "Note")}</th>
              <th>{t("状态", "Status")}</th>
              <th>{t("生成", "Created")}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const label = formatRedeemCode(r.code);
              return (
                <tr key={r.code}>
                  <td className="font-mono">{label}</td>
                  <td>{(() => {
                    const p = findPlan(site.plans, r.plan_id);
                    // 生成时改过天数的，名字跟着天数改（「高速版 10天体验」）
                    return p ? withCodeDays(p, r.days).name : t(`${r.plan_id}（已下架）`, `${r.plan_id} (retired)`);
                  })()}</td>
                  <td className="text-base-content/60">{r.note ?? ""}</td>
                  <td>
                    {r.used_by === null ? (
                      <span className="flex items-center gap-1">
                        <span className="badge badge-sm badge-success">{t("没用过", "Unused")}</span>
                        <VoidCode code={r.code} label={label} />
                      </span>
                    ) : r.order_id === null && !FREE_IDS.includes(r.plan_id) ? (
                      // 占住了但没记账：兑换时 Marzban 出了问题，要去核对（见 docs/portal-deploy.md「兑换码卡住了」）
                      <span className="badge badge-sm badge-error">{t("卡住了，要核对", "Stuck, needs checking")}</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1 text-sm">
                        {r.email ? <CustomerLink id={r.used_by} email={r.email} wechat={r.wechat} /> : t(`客人 ${r.used_by}`, `Customer ${r.used_by}`)}
                        <span className="text-base-content/60">{t(`${formatExpire(r.used_at, lang, tz)} 用的`, `used ${formatExpire(r.used_at, lang, tz)}`)}</span>
                        {r.order_id === null ? (
                          <span className="text-base-content/60">{t("（免费体验，不记订单）", "(free trial, no order)")}</span>
                        ) : (
                          <>
                            <span className="text-base-content/60">{t("，", ",")}</span>
                            <Link href={`/admin?view=all&q=${r.order_no ?? r.order_id}`} className="link link-hover">
                              {t("订单", "Order")} {formatOrderNo(r.order_no)}
                            </Link>
                          </>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-base-content/60">{formatExpire(r.created_at, lang, tz)}</td>
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
