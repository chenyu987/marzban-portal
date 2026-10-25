"use client";

import { useActionState, useState } from "react";
import { adminAdjustBalance, adminBindSubscription, adminResetLink } from "../../actions";

function Alert({ state }: { state?: { error?: string; ok?: string } }) {
  if (state?.error) return <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>;
  if (state?.ok) return <div role="alert" className="alert alert-success alert-soft text-sm">{state.ok}</div>;
  return null;
}

// 客人详情页上的三个操作。改余额会改线上数据，提交前弹框再确认一次
export default function CustomerActions({ customerId, email }: { customerId: number; email: string }) {
  const [adjust, adjustAction, adjusting] = useActionState(adminAdjustBalance, undefined);
  const [reset, resetAction, resetting] = useActionState(adminResetLink, undefined);
  const [bind, bindAction, binding] = useActionState(adminBindSubscription, undefined);
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <form
        action={adjustAction}
        onSubmit={(e) => {
          const f = new FormData(e.currentTarget);
          if (!confirm(`给 ${email} 的余额 ${f.get("amount")} 元？\n原因：${f.get("note")}`)) e.preventDefault();
        }}
        className="card bg-base-100 shadow-sm"
      >
        <div className="card-body gap-2 p-4">
          <h3 className="font-bold">加减余额</h3>
          <input type="hidden" name="customerId" value={customerId} />
          <input name="amount" required placeholder="金额，扣钱写负数，如 -5" inputMode="decimal" className="input input-sm w-full" />
          <input name="note" required maxLength={100} placeholder="原因（必填）" className="input input-sm w-full" />
          <button className="btn btn-sm" disabled={adjusting}>
            确定
          </button>
          <Alert state={adjust} />
        </div>
      </form>

      <form action={resetAction} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-2 p-4">
          <h3 className="font-bold">重置密码链接</h3>
          <p className="text-xs text-base-content/60">24 小时有效、只能用一次。先确认是客人本人再发。</p>
          <input type="hidden" name="customerId" value={customerId} />
          <button className="btn btn-sm" disabled={resetting}>
            生成链接
          </button>
          {reset?.error && <Alert state={reset} />}
          {reset?.ok && (
            <div className="flex flex-col gap-1">
              <code className="break-all rounded-box bg-base-200 p-2 text-xs">{reset.ok}</code>
              <button
                type="button"
                className="btn btn-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(reset.ok!);
                  setCopied(true);
                }}
              >
                {copied ? "已复制 ✓" : "复制链接"}
              </button>
            </div>
          )}
        </div>
      </form>

      <form action={bindAction} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-2 p-4">
          <h3 className="font-bold">绑定已有订阅</h3>
          <p className="text-xs text-base-content/60">把 Marzban 上已有的用户挂到这个客人名下。</p>
          <input type="hidden" name="customerId" value={customerId} />
          <input name="username" required placeholder="Marzban 用户名" autoComplete="off" className="input input-sm w-full" />
          <button className="btn btn-sm" disabled={binding}>
            绑定
          </button>
          <Alert state={bind} />
        </div>
      </form>
    </div>
  );
}
