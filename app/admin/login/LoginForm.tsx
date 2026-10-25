"use client";

import { useActionState } from "react";
import { adminLogin } from "../actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState(adminLogin, undefined);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={action} className="card w-full max-w-sm bg-base-100 shadow-md">
        <div className="card-body gap-4">
          <h1 className="text-2xl font-bold">管理后台</h1>
          <label className="floating-label">
            <span>管理员邮箱</span>
            <input name="email" type="email" required autoComplete="username" placeholder="管理员邮箱" defaultValue={state?.email} className="input w-full" />
          </label>
          <label className="floating-label">
            <span>密码</span>
            <input name="password" type="password" required autoComplete="current-password" placeholder="密码" className="input w-full" />
          </label>
          {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
          <button className="btn btn-primary" disabled={pending}>
            {pending && <span className="loading loading-spinner loading-sm" />}
            登录
          </button>
        </div>
      </form>
    </main>
  );
}
