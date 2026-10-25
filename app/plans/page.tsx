import Link from "next/link";
import { db } from "@/lib/env";
import { requireCustomer } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { BRAND } from "@/lib/clients";
import { site } from "@/site.config";
import type { Plan } from "@/site.config.example";
import RedeemForm from "./RedeemForm";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const customer = await requireCustomer();
  const { results } = await db()
    .prepare("SELECT marzban_username FROM subscriptions WHERE customer_id = ? ORDER BY id")
    .bind(customer.id)
    .all<{ marzban_username: string }>();

  // 按 group 分组，保持配置里的顺序
  const groups = new Map<string, Plan[]>();
  for (const p of site.plans) {
    const g = p.group ?? p.name;
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="navbar px-0">
        <div className="flex-1 text-xl font-bold">{BRAND}</div>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          我的订阅
        </Link>
        <Link href="/tutorial" className="btn btn-ghost btn-sm">
          安装教程
        </Link>
      </header>

      <h1 className="mt-4 mb-4 text-2xl font-bold">购买套餐</h1>

      <RedeemForm note={site.purchaseNote} subscriptions={results.map((r) => r.marzban_username)} />

      <div className="mt-8 flex flex-col gap-4">
        {site.plans.length === 0 && <p className="text-base-content/70">套餐还在准备中。</p>}
        {[...groups].map(([group, plans]) => (
          <div key={group} className="card bg-base-100 shadow-sm">
            <div className="card-body gap-2">
              <h2 className="card-title text-base">{group}</h2>
              <p className="text-sm text-base-content/70">{describe(plans[0])}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {plans.map((p) => (
                  <div key={p.id} className="rounded-box bg-base-200 p-3 text-center">
                    <div className="text-sm text-base-content/60">{p.name.replace(group, "").trim() || `${p.days} 天`}</div>
                    <div className="text-lg font-bold">
                      {site.currency}
                      {formatMoney(p.price).replace(/\.00$/, "")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        {site.deviceLimitNote && <p className="text-sm text-base-content/60">{site.deviceLimitNote}</p>}
      </div>
    </div>
  );
}

function describe(p: Plan): string {
  const data = p.dataGB === null ? "不限流量" : `${p.dataGB} GB${p.dataReset === "month" ? "/月" : ""}`;
  const ip = p.ip ? `同时在线 ${p.ip} 个 IP` : "不限设备";
  return `${data}，${ip}`;
}
