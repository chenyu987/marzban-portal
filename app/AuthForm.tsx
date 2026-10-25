"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BRAND } from "@/lib/clients";
import type { FormState } from "./actions";

type Props = {
  title: string;
  submitLabel: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  passwordAutoComplete: "current-password" | "new-password";
  footer: { text: string; href: string; link: string };
  // 注册页才有推荐码输入框；值是推荐链接里带过来的 ?ref=
  referral?: { defaultValue: string };
  // 登录页在密码下面显示「忘记密码？」
  forgotLink?: boolean;
};

export default function AuthForm({ title, submitLabel, action, passwordAutoComplete, footer, referral, forgotLink }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={formAction} className="card w-full max-w-sm bg-base-100 shadow-md">
        <div className="card-body gap-4">
          <h1 className="text-2xl font-bold">{BRAND}</h1>
          <p className="text-base-content/70">{title}</p>
          <label className="floating-label">
            <span>邮箱</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="邮箱"
              defaultValue={state?.email}
              className="input w-full"
            />
          </label>
          <label className="floating-label">
            <span>密码</span>
            <input
              name="password"
              type="password"
              required
              minLength={passwordAutoComplete === "new-password" ? 8 : undefined}
              autoComplete={passwordAutoComplete}
              placeholder={passwordAutoComplete === "new-password" ? "密码（至少 8 位）" : "密码"}
              className="input w-full"
            />
          </label>
          {forgotLink && (
            <Link href="/forgot" className="link link-hover -mt-2 self-end text-sm text-base-content/60">
              忘记密码？
            </Link>
          )}
          {referral && (
            <label className="floating-label">
              <span>推荐码（选填）</span>
              <input
                name="ref"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="推荐码（选填）"
                defaultValue={state?.ref ?? referral.defaultValue}
                className="input w-full uppercase"
              />
            </label>
          )}
          {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
          <button className="btn btn-primary" disabled={pending}>
            {pending && <span className="loading loading-spinner loading-sm" />}
            {submitLabel}
          </button>
          <p className="text-center text-sm text-base-content/70">
            {footer.text}
            <Link href={footer.href} className="link link-primary ml-1">
              {footer.link}
            </Link>
          </p>
        </div>
      </form>
    </main>
  );
}
