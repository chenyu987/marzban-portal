"use client";

import { useActionState } from "react";
import { updateEmail, updatePassword, updatePrefs, updateWechat, type FormState } from "../actions";

function Result({ state }: { state: FormState }) {
  if (state?.error) return <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>;
  if (state?.ok) return <div role="alert" className="alert alert-success alert-soft text-sm">{state.ok}</div>;
  return null;
}

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button className="btn btn-primary btn-sm self-start" disabled={pending}>
      {pending && <span className="loading loading-spinner loading-xs" />}
      {label}
    </button>
  );
}

export function WechatForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(updateWechat, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input name="wechat" required maxLength={30} defaultValue={state?.wechat ?? current} placeholder="微信号" aria-label="微信号" autoComplete="off" spellCheck={false} className="input input-sm w-full" />
      <Submit pending={pending} label="保存微信号" />
      <Result state={state} />
    </form>
  );
}

export function EmailForm() {
  const [state, action, pending] = useActionState(updateEmail, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input name="email" type="email" required defaultValue={state?.email} placeholder="新邮箱" aria-label="新邮箱" autoComplete="email" className="input input-sm w-full" />
      <input name="password" type="password" required placeholder="当前密码" aria-label="当前密码（改邮箱）" autoComplete="current-password" className="input input-sm w-full" />
      <Submit pending={pending} label="改邮箱" />
      <Result state={state} />
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input name="current" type="password" required placeholder="当前密码" aria-label="当前密码" autoComplete="current-password" className="input input-sm w-full" />
      <input name="next" type="password" required minLength={8} placeholder="新密码（至少 8 位）" aria-label="新密码" autoComplete="new-password" className="input input-sm w-full" />
      <input name="confirm" type="password" required minLength={8} placeholder="再输一次新密码" aria-label="再输一次新密码" autoComplete="new-password" className="input input-sm w-full" />
      <Submit pending={pending} label="改密码" />
      <Result state={state} />
    </form>
  );
}

export function PrefsForm({ notify }: { notify: boolean }) {
  const [state, action, pending] = useActionState(updatePrefs, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label cursor-pointer justify-start gap-2">
        <input name="notify" type="checkbox" defaultChecked={notify} className="toggle toggle-sm toggle-primary" />
        <span className="text-sm">订阅快到期时发邮件提醒我</span>
      </label>
      <Submit pending={pending} label="保存" />
      <Result state={state} />
    </form>
  );
}
