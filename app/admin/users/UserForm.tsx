"use client";

import { useActionState } from "react";
import { RESET_STRATEGIES } from "@/lib/admin-users";
import { RESET_LABEL } from "@/lib/format";
import type { FormState } from "../../actions";

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
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const name = editing ? username : String(new FormData(e.currentTarget).get("username") ?? "");
        if (!confirm(editing ? `保存对 ${name} 的修改？会马上改到 Marzban 上` : `在 Marzban 上新建订阅 ${name}？`)) e.preventDefault();
      }}
      className="card bg-base-100 shadow-sm"
    >
      <div className="card-body grid gap-3 sm:grid-cols-2">
        {editing ? (
          <input type="hidden" name="username" value={username} />
        ) : (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm text-base-content/70">订阅名，也就是 Marzban 用户名（3–32 位小写字母、数字、下划线，建好就不能改）</span>
            <input name="username" required pattern="[a-z0-9_]{3,32}" placeholder="比如客人的微信号" className="input input-sm w-full" />
          </label>
        )}
        {!editing && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm text-base-content/70">绑到哪个客人名下（填客人的邮箱或微信号，选填；绑了客人登录就能看到）</span>
            <input name="customer" defaultValue={defaults.customer} placeholder="选填" className="input input-sm w-full" />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">流量上限（GB，留空不限）</span>
          <input name="dataGB" defaultValue={defaults.dataGB} inputMode="decimal" placeholder="不限" className="input input-sm w-full" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">流量多久清零</span>
          <select name="resetStrategy" defaultValue={defaults.reset} className="select select-sm w-full">
            {RESET_STRATEGIES.map((r) => (
              <option key={r} value={r}>
                {RESET_LABEL[r] ?? "不重置"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">到期时间（北京时间，留空永不到期）</span>
          <input name="expire" type="datetime-local" defaultValue={defaults.expire} className="input input-sm w-full" />
        </label>
        {editing ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-base-content/70">或者续期几天（填了就不看上面的到期时间）</span>
            <input name="addDays" inputMode="numeric" placeholder="比如 30" className="input input-sm w-full" />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-base-content/70">或者首次连上才开始计时，有效几天（适合试用；填了就不看到期时间）</span>
            <input name="onHoldDays" inputMode="numeric" placeholder="比如 3" className="input input-sm w-full" />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">状态</span>
          <select name="status" defaultValue={defaults.status} className="select select-sm w-full">
            <option value="active">启用</option>
            <option value="disabled">停用</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">备注（ip=N 是限设备数，IP 监控按它读）</span>
          <input name="note" defaultValue={defaults.note} maxLength={500} className="input input-sm w-full" />
        </label>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <button className="btn btn-primary btn-sm" disabled={pending}>
            {pending && <span className="loading loading-spinner loading-sm" />}
            {editing ? "保存修改" : "新建"}
          </button>
          {state?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>}
          {state?.ok && <div role="alert" className="alert alert-success alert-soft text-sm">{state.ok}</div>}
        </div>
      </div>
    </form>
  );
}
