"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestReset } from "../actions";
import ContactSupport from "../ContactSupport";
import Brand from "../Brand";

// 还不能发邮件时（没配发信服务）不显示输入框，直接让客人找管理员
export default function ForgotForm({ canSend }: { canSend: boolean }) {
  const [state, action, pending] = useActionState(requestReset, undefined);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={action} className="card w-full max-w-sm bg-base-100 shadow-md">
        <div className="card-body gap-4">
          <Brand size={36} className="text-2xl" />
          <p className="text-base-content/70">忘记密码</p>
          {canSend ? (
            <>
              <p className="text-sm text-base-content/70">输入注册时用的邮箱，我们会发一封带重置链接的邮件给你。</p>
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
              {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
      {state?.error?.includes("联系客服") && <ContactSupport />}
              {state?.ok && <div role="alert" className="alert alert-success alert-soft">{state.ok}</div>}
              <button className="btn btn-primary" disabled={pending}>
                {pending && <span className="loading loading-spinner loading-sm" />}
                发送重置链接
              </button>
            </>
          ) : (
            <>
              <p className="text-sm">请联系客服，报上你注册用的邮箱和微信号，客服核对是你本人后，会发给你一个重置密码的链接（24 小时内有效）。</p>
              <ContactSupport />
            </>
          )}
          <p className="text-center text-sm text-base-content/70">
            想起来了？
            <Link href="/login" className="link link-primary ml-1">
              去登录
            </Link>
          </p>
        </div>
      </form>
    </main>
  );
}
