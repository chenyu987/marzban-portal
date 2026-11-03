"use client";

import { useActionState } from "react";
import type { FormState } from "../../actions";
import { confirmSubmit } from "../../ConfirmDialog";
import { adminChangePassword, adminLogoutSessions, adminSavePrefs } from "./actions";

function Result({ state }: { state: FormState }) {
  if (state?.error) return <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>;
  if (state?.ok) return <div role="alert" className="alert alert-success alert-soft text-sm">{state.ok}</div>;
  return null;
}

function Submit({ pending, label, className = "btn-primary", disabled = false }: { pending: boolean; label: string; className?: string; disabled?: boolean }) {
  return (
    <button className={`btn btn-sm self-start ${className}`} disabled={pending || disabled}>
      {pending && <span className="loading loading-spinner loading-xs" />}
      {label}
    </button>
  );
}

// 改密码：先输当前密码；改完别的设备全部退出（服务器那边做）
export function AdminPasswordForm() {
  const [state, action, pending] = useActionState(adminChangePassword, undefined);
  return (
    <form action={action} className="flex max-w-sm flex-col gap-2">
      <input name="current" type="password" required aria-label="当前密码" placeholder="当前密码" autoComplete="current-password" className="input input-sm w-full" />
      <input name="next" type="password" required minLength={8} aria-label="新密码" placeholder="新密码（至少 8 位）" autoComplete="new-password" className="input input-sm w-full" />
      <input name="confirm" type="password" required minLength={8} aria-label="再输一次新密码" placeholder="再输一次新密码" autoComplete="new-password" className="input input-sm w-full" />
      <p className="text-xs text-base-content/60">改完后，除了这台设备，别的地方的后台登录都会退出。</p>
      <Submit pending={pending} label="改密码" />
      <Result state={state} />
    </form>
  );
}

// 退出别的设备：sid 给了就只退出那一个，没给就除了这台全部退出。都要确认一次
// disabled：没有别的设备了。按钮留着不拿掉，刚才退出的结果提示才看得到
export function LogoutSessionsButton({ sid, label, disabled = false }: { sid?: string; label: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(adminLogoutSessions, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => confirmSubmit(e, sid ? "退出这台设备上的后台登录？" : "除了这台设备，别的地方的后台登录全部退出？", { ok: "退出", danger: true })}
      className="flex flex-col gap-2"
    >
      {sid && <input type="hidden" name="sid" value={sid} />}
      <Submit pending={pending} label={label} disabled={disabled} className={sid ? "btn-ghost btn-xs" : "btn-outline btn-error"} />
      <Result state={state} />
    </form>
  );
}

export function PrefsForm({
  pageSize,
  sort,
  time,
  pageSizes,
  sorts,
}: {
  pageSize: number | null;
  sort: string | null;
  time: "relative" | "absolute";
  pageSizes: readonly number[];
  sorts: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(adminSavePrefs, undefined);
  return (
    <form action={action} className="flex max-w-sm flex-col gap-3">
      <label className="flex items-center justify-between gap-2 text-sm">
        订阅列表每页
        <select name="page_size" defaultValue={pageSize ?? ""} className="select select-sm w-40" aria-label="订阅列表每页">
          <option value="">默认（50）</option>
          {pageSizes.map((n) => (
            <option key={n} value={n}>
              {n} 个
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">
        订阅列表默认排序
        <select name="sort" defaultValue={sort ?? ""} className="select select-sm w-40" aria-label="订阅列表默认排序">
          <option value="">默认（最新建的在前）</option>
          {Object.entries(sorts).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">
        到期时间显示成
        <select name="time" defaultValue={time} className="select select-sm w-40" aria-label="到期时间显示成">
          <option value="relative">多久以后（3 天后到期）</option>
          <option value="absolute">具体日期（2026/11/07 23:59）</option>
        </select>
      </label>
      <Submit pending={pending} label="保存偏好" />
      <Result state={state} />
    </form>
  );
}
