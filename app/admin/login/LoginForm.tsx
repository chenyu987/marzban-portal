"use client";

import { useActionState } from "react";
import { adminLogin } from "../actions";
import { Logo } from "../../Brand";
import { useT } from "../../LangContext";

export default function LoginForm() {
  const [state, action, pending] = useActionState(adminLogin, undefined);
  const t = useT();
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={action} className="card w-full max-w-sm bg-base-100 shadow-md">
        <div className="card-body gap-4">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Logo size={32} />
            {t("管理后台", "Admin")}
          </h1>
          <label className="floating-label">
            <span>{t("管理员邮箱", "Admin email")}</span>
            <input name="email" type="email" required autoComplete="username" placeholder={t("管理员邮箱", "Admin email")} defaultValue={state?.email} className="input w-full" />
          </label>
          <label className="floating-label">
            <span>{t("密码", "Password")}</span>
            <input name="password" type="password" required autoComplete="current-password" placeholder={t("密码", "Password")} className="input w-full" />
          </label>
          {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
          <button className="btn btn-primary" disabled={pending}>
            {pending && <span className="loading loading-spinner loading-sm" />}
            {t("登录", "Log in")}
          </button>
        </div>
      </form>
    </main>
  );
}
