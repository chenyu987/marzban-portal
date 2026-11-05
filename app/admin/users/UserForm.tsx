"use client";

import { useActionState } from "react";
import { RESET_STRATEGIES } from "@/lib/admin-users";
import { resetLabel } from "@/lib/format";
import { useLang } from "../../LangContext";
import { makeT } from "@/lib/i18n";
import type { FormState } from "../../actions";
import ExpireInput from "./ExpireInput";

type Defaults = { dataGB: string; reset: string; expire: string; note: string; status: string; customer?: string };

// 新建和编辑共用。改的是线上 Marzban，提交前弹框再确认一次
export default function UserForm({
  action,
  username,
  defaults,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  username?: string; // 有就是编辑
  defaults: Defaults;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const editing = !!username;
  const lang = useLang();
  const t = makeT(lang);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const name = editing ? username : String(new FormData(e.currentTarget).get("username") ?? "");
        if (!confirm(
            editing
              ? t(`保存对 ${name} 的修改？会马上改到 Marzban 上`, `Save changes to ${name}? They go to Marzban right away`)
              : t(`在 Marzban 上新建订阅 ${name}？`, `Create subscription ${name} on Marzban?`),
          )) e.preventDefault();
      }}
      className="card bg-base-100 shadow-sm"
    >
      <div className="card-body grid gap-3 sm:grid-cols-2">
        {editing ? (
          <input type="hidden" name="username" value={username} />
        ) : (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm text-base-content/70">
              {t(
                "订阅名，也就是 Marzban 用户名（3–32 位小写字母、数字、下划线，建好就不能改）",
                "Name, i.e. the Marzban username (3–32 lowercase letters, digits, underscores; can't be changed later)",
              )}
            </span>
            <input name="username" required pattern="[a-z0-9_]{3,32}" placeholder={t("比如客人的微信号", "e.g. the customer's WeChat ID")} className="input input-sm w-full" />
          </label>
        )}
        {!editing && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm text-base-content/70">
              {t(
                "绑到哪个客人名下（填客人的邮箱或微信号，选填；绑了客人登录就能看到）",
                "Link to customer (email or WeChat ID, optional; they'll see it after logging in)",
              )}
            </span>
            <input name="customer" defaultValue={defaults.customer} placeholder={t("选填", "Optional")} className="input input-sm w-full" />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">{t("流量上限（GB，留空不限）", "Data limit (GB, blank = unlimited)")}</span>
          <input name="dataGB" defaultValue={defaults.dataGB} inputMode="decimal" placeholder={t("不限", "Unlimited")} className="input input-sm w-full" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">{t("流量多久清零", "Traffic reset")}</span>
          <select name="resetStrategy" defaultValue={defaults.reset} className="select select-sm w-full">
            {RESET_STRATEGIES.map((r) => (
              <option key={r} value={r}>
                {resetLabel(r, lang) ?? t("不重置", "No reset")}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">{t("到期时间（北京时间，不选就是永不到期）", "Expiry (Beijing time; leave empty for never)")}</span>
          <ExpireInput defaultValue={defaults.expire} />
        </div>
        {editing ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-base-content/70">{t("或者续期几天（填了就不看上面的到期时间）", "Or add days (overrides the expiry above)")}</span>
            <input name="addDays" inputMode="numeric" placeholder={t("比如 30", "e.g. 30")} className="input input-sm w-full" />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-base-content/70">
              {t(
                "或者首次连上才开始计时，有效几天（适合试用；填了就不看到期时间）",
                "Or start the clock on first connection, valid for N days (good for trials; overrides expiry)",
              )}
            </span>
            <input name="onHoldDays" inputMode="numeric" placeholder={t("比如 3", "e.g. 3")} className="input input-sm w-full" />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">{t("状态", "Status")}</span>
          <select name="status" defaultValue={defaults.status} className="select select-sm w-full">
            <option value="active">{t("启用", "Enabled")}</option>
            <option value="disabled">{t("停用", "Disabled")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">{t("备注（ip=N 是限设备数，IP 监控按它读）", "Note (ip=N limits devices; the IP monitor reads it)")}</span>
          <input name="note" defaultValue={defaults.note} maxLength={500} className="input input-sm w-full" />
        </label>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <button className="btn btn-primary btn-sm" disabled={pending}>
            {pending && <span className="loading loading-spinner loading-sm" />}
            {editing ? t("保存修改", "Save changes") : t("新建", "Create")}
          </button>
          {state?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>}
          {state?.ok && <div role="alert" className="alert alert-success alert-soft text-sm">{state.ok}</div>}
        </div>
      </div>
    </form>
  );
}
