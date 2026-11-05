"use client";

import Link from "next/link";
import { useActionState } from "react";
import Brand from "./Brand";
import Turnstile from "./Turnstile";
import { useT } from "./LangContext";
import type { FormState } from "./actions";
import type { AuthAside } from "@/lib/public-site";

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
  // 左边的标题、介绍、卖点，由页面（服务器）从 site.config 算好传进来
  aside: AuthAside;
  // 配了 Turnstile 才有（注册页用），没配就不显示人机验证
  turnstileSiteKey?: string | null;
};

export default function AuthForm({ title, submitLabel, action, passwordAutoComplete, footer, referral, forgotLink, aside, turnstileSiteKey }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const t = useT();
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* 左边：品牌和卖点（大屏才有）。品牌在左上角，卖点在这半边正中间 */}
      <aside className="brand-gradient relative hidden items-center justify-center overflow-hidden p-12 text-white lg:flex">
        <Brand size={40} className="absolute top-12 left-12 text-2xl text-white" />
        <div className="w-full max-w-md" data-testid="auth-aside">
          <h2 className="text-4xl leading-tight font-extrabold">{aside.headline}</h2>
          <p className="mt-4 text-lg text-white/85">{aside.sub}</p>
          {aside.highlights && (
            <ul className="mt-8 grid gap-3">
              {aside.highlights.map((h) => (
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
      </aside>

      {/* 右边：表单 */}
      <div className="flex items-center justify-center px-4 py-10">
      <form action={formAction} className="card w-full max-w-sm bg-base-100 shadow-lg">
        <div className="card-body gap-4">
          <Brand size={36} className="text-2xl lg:hidden" />
          <h1 className="text-2xl font-bold">{title}</h1>
          <label className="floating-label">
            <span>{t("邮箱", "Email")}</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder={t("邮箱", "Email")}
              defaultValue={state?.email}
              className="input w-full"
            />
          </label>
          <label className="floating-label">
            <span>{t("密码", "Password")}</span>
            <input
              name="password"
              type="password"
              required
              minLength={passwordAutoComplete === "new-password" ? 8 : undefined}
              autoComplete={passwordAutoComplete}
              placeholder={passwordAutoComplete === "new-password" ? t("密码（至少 8 位）", "Password (at least 8 characters)") : t("密码", "Password")}
              className="input w-full"
            />
          </label>
          {forgotLink && (
            <Link href="/forgot" className="link link-hover -mt-2 self-end text-sm text-base-content/60">
              {t("忘记密码？", "Forgot password?")}
            </Link>
          )}
          {referral && (
            <div>
              <label className="floating-label">
                <span>{t("微信号", "WeChat ID")}</span>
                <input
                  name="wechat"
                  type="text"
                  required
                  maxLength={30}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={t("微信号", "WeChat ID")}
                  defaultValue={state?.wechat}
                  className="input w-full"
                />
              </label>
              <p className="mt-1 text-xs text-base-content/60">{t("为了方便客服联系你，提供必要的支持和更新", "So our support team can reach you with help and updates")}</p>
            </div>
          )}
          {referral && (
            <label className="floating-label">
              <span>{t("推荐码（选填）", "Referral code (optional)")}</span>
              <input
                name="ref"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={t("推荐码（选填）", "Referral code (optional)")}
                defaultValue={state?.ref ?? referral.defaultValue}
                className="input w-full uppercase"
              />
            </label>
          )}
          {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} resetKey={state} />}
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
