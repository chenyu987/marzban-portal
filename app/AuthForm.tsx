"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import Brand from "./Brand";
import LangSwitch from "./LangSwitch";
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
              <WechatWhy />
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
          {/* 最后一行：中间「已经有账号？登录」，右下角切换中英文。左右两格一样宽，中间那句才在正中 */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <span />
            <p className="text-center text-sm text-base-content/70">
              {footer.text}
              <Link href={footer.href} className="link link-primary ml-1">
                {footer.link}
              </Link>
            </p>
            <div className="justify-self-end">
              <LangSwitch compact />
            </div>
          </div>
        </div>
      </form>
      </div>
    </main>
  );
}

// 微信号下面的一句说明，后面一个圆圈叹号：点开再多说几句（只用来干什么、不发广告），再点收起
function WechatWhy() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 text-xs text-base-content/60">
      <div className="flex items-center gap-1">
        <span>{t("为了方便客服联系你，提供必要的支持和更新", "So our support team can reach you with help and updates")}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-label={t("为什么要填这个", "Why we ask")}
          onClick={() => setOpen(!open)}
          className={`inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${open ? "text-primary" : "text-base-content/40 hover:text-base-content/70"}`}
        >
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
            <path
              fill="currentColor"
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-box bg-base-200 px-3 py-2 leading-relaxed text-base-content/70" data-testid="wechat-why">
          {t(
            "微信号只用来：开通遇到问题、订阅快到期、节点有调整时联系你，以及你找客服时确认是你本人。不会给你发任何广告，也不会给别人。",
            "We only use it to reach you if setup goes wrong, your plan is about to expire, or servers change, and to confirm it's you when you contact support. No ads, ever, and we never share it.",
          )}
        </div>
      )}
    </div>
  );
}
