"use client";

import Link from "next/link";
import { useActionState } from "react";
import { site } from "@/site.config";
import Brand from "./Brand";
import type { FormState } from "./actions";

type Props = {
  title: string;
  submitLabel: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  passwordAutoComplete: "current-password" | "new-password";
  footer: { text: string; href: string; link: string };
  // 注册页才有微信号和推荐码输入框；推荐码的值是推荐链接里带过来的 ?ref=
  referral?: { defaultValue: string };
  // 登录页在密码下面显示「忘记密码？」
  forgotLink?: boolean;
};

export default function AuthForm({ title, submitLabel, action, passwordAutoComplete, footer, referral, forgotLink }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* 左边：品牌和卖点（大屏才有） */}
      <aside className="brand-gradient relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <Brand size={40} className="text-2xl text-white" />
        <div>
          <h2 className="text-4xl leading-tight font-extrabold">{site.landing?.headline ?? site.brand}</h2>
          <p className="mt-4 max-w-md text-lg text-white/85">{site.landing?.sub ?? site.description}</p>
          {site.landing?.highlights && (
            <ul className="mt-8 grid max-w-md gap-3">
              {site.landing.highlights.slice(0, 4).map((h) => (
                <li key={h.title} className="flex items-start gap-3 rounded-box bg-white/10 p-3 backdrop-blur">
                  <span className="text-2xl" aria-hidden>
                    {h.icon}
                  </span>
                  <span>
                    <b>{h.title}</b>
                    <span className="block text-sm text-white/80">{h.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-sm text-white/70">节点：{site.landing?.regions?.map((r) => r.name).join(" · ")}</p>
      </aside>

      {/* 右边：表单 */}
      <div className="flex items-center justify-center px-4 py-10">
      <form action={formAction} className="card w-full max-w-sm bg-base-100 shadow-lg">
        <div className="card-body gap-4">
          <Brand size={36} className="text-2xl lg:hidden" />
          <h1 className="text-2xl font-bold">{title}</h1>
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
            <div>
              <label className="floating-label">
                <span>微信号</span>
                <input
                  name="wechat"
                  type="text"
                  required
                  maxLength={30}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="微信号"
                  defaultValue={state?.wechat}
                  className="input w-full"
                />
              </label>
              <p className="mt-1 text-xs text-base-content/60">为了方便客服联系你，提供必要的支持和更新</p>
            </div>
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
      </div>
    </main>
  );
}
