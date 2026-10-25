"use client";

import { useActionState } from "react";
import { bindSubscription } from "../actions";

export default function BindForm() {
  const [state, action, pending] = useActionState(bindSubscription, undefined);
  return (
    <form action={action} className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">绑定已有订阅</h2>
        <p className="text-sm text-base-content/70">把管理员发给你的订阅链接粘贴进来，就能在这里看到到期时间和流量。</p>
        <div className="join w-full">
          <input
            name="link"
            required
            placeholder="https://.../sub/..."
            autoComplete="off"
            className="input join-item w-full"
          />
          <button className="btn btn-primary join-item" disabled={pending}>
            {pending && <span className="loading loading-spinner loading-sm" />}
            绑定
          </button>
        </div>
        {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
        {state?.ok && <div role="alert" className="alert alert-success alert-soft">{state.ok}</div>}
      </div>
    </form>
  );
}
