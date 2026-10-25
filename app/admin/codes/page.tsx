import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatExpire, formatMoney, formatRedeemCode } from "@/lib/format";
import { findPlan } from "@/lib/plans";
import { site } from "@/site.config";
import AdminHeader from "../AdminHeader";
import { CreateCodes, VoidCode } from "./CodeForms";

export const dynamic = "force-dynamic";

type Row = {
  code: string;
  plan_id: string;
  note: string | null;
  used_by: number | null;
  used_at: number | null;
  order_id: number | null;
  email: string | null;
  created_at: number;
};

// 兑换码：生成、看状态、作废没用过的。?unused=1 只看没用过的
export default async function CodesPage({ searchParams }: { searchParams: Promise<{ unused?: string }> }) {
  const admin = await requireAdmin();
  const unused = (await searchParams).unused === "1";
  const { results } = await db()
    .prepare(
      `SELECT r.code, r.plan_id, r.note, r.used_by, r.used_at, r.order_id, c.email, r.created_at
       FROM redeem_codes r LEFT JOIN customers c ON c.id = r.used_by
       ${unused ? "WHERE r.used_by IS NULL" : ""}
       ORDER BY r.created_at DESC, r.code LIMIT 200`,
    )
    .all<Row>();
  const plans = site.plans.map((p) => ({ id: p.id, name: p.name, price: `${site.currency}${formatMoney(p.price)}` }));

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <h1 className="mt-4 mb-4 text-2xl font-bold">兑换码</h1>
      <CreateCodes plans={plans} />

      <div className="mt-8 mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold">{unused ? "没用过的" : "最近的"}兑换码</h2>
        <Link href={unused ? "/admin/codes" : "/admin/codes?unused=1"} className="link link-hover text-sm">
          {unused ? "看全部" : "只看没用过的"}
        </Link>
      </div>
      {results.length === 0 && <p className="text-sm text-base-content/60">没有。</p>}
      <div className="overflow-x-auto">
        <table className="table table-sm">
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
                      <span className="text-sm">
                        {r.email ?? `客人 ${r.used_by}`} {formatExpire(r.used_at)} 用的
                      </span>
                    )}
                  </td>
                  <td className="text-base-content/60">{formatExpire(r.created_at)} 生成</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
