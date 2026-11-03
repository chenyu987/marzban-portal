"use client";

import { useActionState } from "react";
import { updateEmail, updatePassword, updatePrefs, updateWechat, type FormState } from "../actions";
import { useT } from "../LangContext";

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
  const t = useT();
  return (
    <form action={action} className="flex flex-col gap-2">
      <input name="wechat" required maxLength={30} defaultValue={state?.wechat ?? current} placeholder={t("微信号", "WeChat ID")} aria-label={t("微信号", "WeChat ID")} autoComplete="off" spellCheck={false} className="input input-sm w-full" />
      <Submit pending={pending} label={t("保存微信号", "Save WeChat ID")} />
      <Result state={state} />
    </form>
  );
}

export function EmailForm() {
  const [state, action, pending] = useActionState(updateEmail, undefined);
  const t = useT();
  return (
    <form action={action} className="flex flex-col gap-2">
      <input name="email" type="email" required defaultValue={state?.email} placeholder={t("新邮箱", "New email")} aria-label={t("新邮箱", "New email")} autoComplete="email" className="input input-sm w-full" />
      <input name="password" type="password" required placeholder={t("当前密码", "Current password")} aria-label={t("当前密码（改邮箱）", "Current password (email change)")} autoComplete="current-password" className="input input-sm w-full" />
      <Submit pending={pending} label={t("改邮箱", "Change email")} />
      <Result state={state} />
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);
  const t = useT();
  return (
    <form action={action} className="flex flex-col gap-2">
      <input name="current" type="password" required placeholder={t("当前密码", "Current password")} aria-label={t("当前密码", "Current password")} autoComplete="current-password" className="input input-sm w-full" />
      <input name="next" type="password" required minLength={8} placeholder={t("新密码（至少 8 位）", "New password (at least 8 characters)")} aria-label={t("新密码", "New password")} autoComplete="new-password" className="input input-sm w-full" />
      <input name="confirm" type="password" required minLength={8} placeholder={t("再输一次新密码", "Confirm new password")} aria-label={t("再输一次新密码", "Confirm new password")} autoComplete="new-password" className="input input-sm w-full" />
      <Submit pending={pending} label={t("改密码", "Change password")} />
      <Result state={state} />
    </form>
  );
}

export function PrefsForm({ notify }: { notify: boolean }) {
  const [state, action, pending] = useActionState(updatePrefs, undefined);
  const t = useT();
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="label cursor-pointer justify-start gap-2">
        <input name="notify" type="checkbox" defaultChecked={notify} className="toggle toggle-sm toggle-primary" />
        <span className="text-sm">{t("订阅快到期时发邮件提醒我", "Email me when my subscription is about to expire")}</span>
      </label>
      <Submit pending={pending} label={t("保存", "Save")} />
      <Result state={state} />
    </form>
  );
}
