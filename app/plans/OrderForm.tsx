"use client";

import { useActionState } from "react";
import { createOrder } from "../actions";

export type PlanGroup = {
  name: string;
  description: string;
  plans: { id: string; label: string; name: string; price: string }[];
};

// 套餐价目表。能下单时每个价格都是一个按钮，点了先确认再建单；不能下单时只是价目表
export default function OrderForm({
  groups,
  subscriptions,
  canOrder,
  defaultTarget,
}: {
  groups: PlanGroup[];
  subscriptions: string[];
  canOrder: boolean;
  defaultTarget?: string;
}) {
  const [state, action, pending] = useActionState(createOrder, undefined);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const target = new FormData(e.currentTarget).get("target");
        const what = !target || target === "new" ? "新开一个订阅" : `给 ${target} 续期`;
        if (!btn || !confirm(`下单：${btn.dataset.name}，${btn.dataset.price}，${what}。确定吗？`)) e.preventDefault();
      }}
      className="flex flex-col gap-4"
    >
      {canOrder && subscriptions.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">买给哪个订阅</span>
          <select name="target" className="select w-full" defaultValue={defaultTarget ?? subscriptions[0]}>
            {subscriptions.map((u) => (
              <option key={u} value={u}>
                给 {u} 续期
              </option>
            ))}
            <option value="new">新开一个订阅</option>
          </select>
        </label>
      )}
      {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
      {state?.ok && <div role="alert" className="alert alert-success alert-soft">{state.ok}</div>}

      {groups.map((g) => (
        <div key={g.name} className="card bg-base-100 shadow-sm">
          <div className="card-body gap-2">
            <h2 className="card-title text-base">{g.name}</h2>
            <p className="text-sm text-base-content/70">{g.description}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {g.plans.map((p) =>
                canOrder ? (
                  <button
                    key={p.id}
                    name="plan"
                    value={p.id}
                    data-name={p.name}
                    data-price={p.price}
                    disabled={pending}
                    className="btn h-auto flex-col gap-0 py-3"
                  >
                    <span className="text-sm font-normal text-base-content/60">{p.label}</span>
                    <span className="text-lg font-bold">{p.price}</span>
                  </button>
                ) : (
                  <div key={p.id} className="rounded-box bg-base-200 p-3 text-center">
                    <div className="text-sm text-base-content/60">{p.label}</div>
                    <div className="text-lg font-bold">{p.price}</div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      ))}
    </form>
  );
}
