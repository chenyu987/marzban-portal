"use client";

import { useActionState, useState } from "react";
import { buyWithBalance, createOrder } from "../actions";

export type PlanGroup = {
  name: string;
  description: string;
  // fen：价格（分），选余额付时用来判断够不够
  plans: { id: string; label: string; name: string; price: string; fen: number }[];
};

// 套餐价目表。能买时每个价格都是一个按钮，点了先确认：选转账就建一张待付款的单，选余额就直接扣余额开通。
// 都不能（没配收款码、也没有余额）时只是价目表
export default function OrderForm({
  groups,
  subscriptions,
  canTransfer,
  transferLabel,
  balance,
  balanceText,
  defaultTarget,
}: {
  groups: PlanGroup[];
  subscriptions: string[];
  canTransfer: boolean;
  // 「怎么付」里转账那个按钮的字，比如「支付宝 / 微信转账」
  transferLabel: string;
  balance: number;
  balanceText: string;
  defaultTarget?: string;
}) {
  const [orderState, orderAction, orderPending] = useActionState(createOrder, undefined);
  const [balanceState, balanceAction, balancePending] = useActionState(buyWithBalance, undefined);
  const canBalance = balance > 0;
  const canOrder = canTransfer || canBalance;
  const [method, setMethod] = useState<"transfer" | "balance">(canTransfer ? "transfer" : "balance");
  const useBalance = method === "balance";
  const state = useBalance ? balanceState : orderState;
  const pending = orderPending || balancePending;

  return (
    <form
      action={useBalance ? balanceAction : orderAction}
      onSubmit={(e) => {
        const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const target = new FormData(e.currentTarget).get("target");
        const what = !target || target === "new" ? "新开一个订阅" : `给 ${target} 续期`;
        const how = useBalance ? "用余额付，马上开通" : "下单后转账";
        if (!btn || !confirm(`${btn.dataset.name}，${btn.dataset.price}，${what}，${how}。确定吗？`)) e.preventDefault();
      }}
      className="flex flex-col gap-4"
    >
      {canTransfer && canBalance && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">怎么付</span>
          <div className="join">
            <button
              type="button"
              onClick={() => setMethod("transfer")}
              className={`btn join-item ${!useBalance ? "btn-primary" : ""}`}
            >
              {transferLabel}
            </button>
            <button
              type="button"
              onClick={() => setMethod("balance")}
              className={`btn join-item ${useBalance ? "btn-primary" : ""}`}
            >
              余额（剩 {balanceText}）
            </button>
          </div>
        </div>
      )}
      {!canTransfer && canBalance && <p className="text-sm text-base-content/70">用余额付（剩 {balanceText}），点价格马上开通。</p>}
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
                    disabled={pending || (useBalance && p.fen > balance)}
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
