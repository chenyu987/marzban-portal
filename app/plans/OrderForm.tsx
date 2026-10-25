"use client";

import { useActionState, useState } from "react";
import { createOrder } from "../actions";

export type PlanGroup = {
  name: string;
  description: string;
  // fen：价格（分），用余额抵扣时算还要付多少
  plans: { id: string; label: string; name: string; price: string; fen: number }[];
};

// 套餐价目表。能买时每个价格都是一个按钮，点了先确认再下单。
// 有余额时默认勾选「用余额抵扣」：余额够付全款就马上开通；不够就抵扣一部分，剩下的转账。
// 没配收款码时只能靠余额付全款；既没收款码也没余额时只是价目表
export default function OrderForm({
  groups,
  subscriptions,
  canTransfer,
  balance,
  currency,
  defaultTarget,
}: {
  groups: PlanGroup[];
  subscriptions: string[];
  canTransfer: boolean;
  balance: number;
  currency: string;
  defaultTarget?: string;
}) {
  const [state, action, pending] = useActionState(createOrder, undefined);
  const [useBalance, setUseBalance] = useState(balance > 0);
  const deduct = useBalance ? balance : 0;
  const canOrder = canTransfer || balance > 0;
  const money = (fen: number) => `${currency}${(fen / 100).toFixed(2).replace(/\.00$/, "")}`;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (!btn) return e.preventDefault();
        const fen = Number(btn.dataset.fen);
        const target = new FormData(e.currentTarget).get("target");
        const what = !target || target === "new" ? "新开一个订阅" : `给 ${target} 续期`;
        const how =
          deduct >= fen
            ? "全部用余额付，马上开通"
            : deduct > 0
              ? `余额抵扣 ${money(deduct)}，还要转账 ${money(fen - deduct)}`
              : "下单后转账";
        if (!confirm(`${btn.dataset.name}，${btn.dataset.price}，${what}。${how}。确定吗？`)) e.preventDefault();
      }}
      className="flex flex-col gap-4"
    >
      {balance > 0 && (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name="useBalance"
            value="1"
            checked={useBalance}
            onChange={(e) => setUseBalance(e.target.checked)}
            className="checkbox checkbox-primary checkbox-sm"
          />
          <span>用余额抵扣（剩 {money(balance)}）</span>
        </label>
      )}
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
                    data-fen={p.fen}
                    disabled={pending || (!canTransfer && deduct < p.fen)}
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
