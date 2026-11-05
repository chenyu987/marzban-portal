"use client";

import { useActionState } from "react";
import type { FormState } from "../../actions";
import { confirmSubmit } from "../../ConfirmDialog";
import { adminChangePassword, adminLogoutSessions, adminSavePrefs } from "./actions";
import { useT } from "../../LangContext";

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
  const t = useT();
  return (
    <form action={action} className="flex max-w-sm flex-col gap-2">
      <input name="current" type="password" required aria-label={t("当前密码", "Current password")} placeholder={t("当前密码", "Current password")} autoComplete="current-password" className="input input-sm w-full" />
      <input name="next" type="password" required minLength={8} aria-label={t("新密码", "New password")} placeholder={t("新密码（至少 8 位）", "New password (8+ characters)")} autoComplete="new-password" className="input input-sm w-full" />
      <input name="confirm" type="password" required minLength={8} aria-label={t("再输一次新密码", "Repeat new password")} placeholder={t("再输一次新密码", "Repeat new password")} autoComplete="new-password" className="input input-sm w-full" />
      <p className="text-xs text-base-content/60">{t("改完后，除了这台设备，别的地方的后台登录都会退出。", "After the change, admin sessions on all other devices are logged out.")}</p>
      <Submit pending={pending} label={t("改密码", "Change password")} />
      <Result state={state} />
    </form>
  );
}

// 退出别的设备：sid 给了就只退出那一个，没给就除了这台全部退出。都要确认一次
// disabled：没有别的设备了。按钮留着不拿掉，刚才退出的结果提示才看得到
export function LogoutSessionsButton({ sid, label, disabled = false }: { sid?: string; label: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(adminLogoutSessions, undefined);
  const t = useT();
  return (
    <form
      action={action}
      onSubmit={(e) => confirmSubmit(
          e,
          sid ? t("退出这台设备上的后台登录？", "Log out the admin session on that device?") : t("除了这台设备，别的地方的后台登录全部退出？", "Log out admin sessions on every other device?"),
          { ok: t("退出", "Log out"), danger: true },
        )}
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
  const t = useT();
  return (
    <form action={action} className="flex max-w-sm flex-col gap-3">
      <label className="flex items-center justify-between gap-2 text-sm">
        {t("订阅列表每页", "Subscriptions per page")}
        <select name="page_size" defaultValue={pageSize ?? ""} className="select select-sm w-40" aria-label={t("订阅列表每页", "Subscriptions per page")}>
          <option value="">{t("默认（50）", "Default (50)")}</option>
          {pageSizes.map((n) => (
            <option key={n} value={n}>
              {t(`${n} 个`, String(n))}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">
        {t("订阅列表默认排序", "Default sort")}
        <select name="sort" defaultValue={sort ?? ""} className="select select-sm w-40" aria-label={t("订阅列表默认排序", "Default sort")}>
          <option value="">{t("默认（最新建的在前）", "Default (newest first)")}</option>
          {Object.entries(sorts).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-sm">
        {t("到期时间显示成", "Show expiry as")}
        <select name="time" defaultValue={time} className="select select-sm w-40" aria-label={t("到期时间显示成", "Show expiry as")}>
          <option value="relative">{t("多久以后（3 天后到期）", "Relative (expires in 3 days)")}</option>
          <option value="absolute">{t("具体日期（2026/11/07 23:59）", "Date (2026/11/07 23:59)")}</option>
        </select>
      </label>
      <Submit pending={pending} label={t("保存偏好", "Save preferences")} />
      <Result state={state} />
    </form>
  );
}
