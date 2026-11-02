"use client";

import { useActionState } from "react";
import { resetPassword } from "../actions";
import Brand from "../Brand";

export default function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={action} className="card w-full max-w-sm bg-base-100 shadow-md">
        <div className="card-body gap-4">
          <Brand size={36} className="text-2xl" />
          <p className="text-base-content/70">设置新密码</p>
          <input type="hidden" name="token" value={token} />
          <label className="floating-label">
            <span>新密码（至少 8 位）</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="新密码（至少 8 位）"
              className="input w-full"
            />
          </label>
          <label className="floating-label">
            <span>再输一次</span>
            <input
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="再输一次"
              className="input w-full"
            />
          </label>
          {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
          <button className="btn btn-primary" disabled={pending}>
            {pending && <span className="loading loading-spinner loading-sm" />}
            保存并登录
          </button>
          <p className="text-center text-xs text-base-content/60">保存后，其他设备上的登录会全部退出。</p>
        </div>
      </form>
    </main>
  );
}
