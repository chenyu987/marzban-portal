"use client";

import { useActionState } from "react";
import { redeem } from "../actions";

export default function RedeemForm({ note, subscriptions }: { note: string; subscriptions: string[] }) {
  const [state, action, pending] = useActionState(redeem, undefined);
  return (
    <form action={action} className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">输入兑换码</h2>
        <p className="text-sm text-base-content/70">{note}</p>
        <input
          name="code"
          required
          placeholder="XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          className="input w-full font-mono uppercase"
        />
        {subscriptions.length > 0 && (
          <select name="target" className="select w-full" defaultValue={subscriptions[0]}>
            {subscriptions.map((u) => (
              <option key={u} value={u}>
                给 {u} 续期
              </option>
            ))}
            <option value="new">新开一个订阅</option>
          </select>
        )}
        <button className="btn btn-primary" disabled={pending}>
          {pending && <span className="loading loading-spinner loading-sm" />}
          兑换
        </button>
        {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
        {state?.ok && <div role="alert" className="alert alert-success alert-soft">{state.ok}</div>}
      </div>
    </form>
  );
}
