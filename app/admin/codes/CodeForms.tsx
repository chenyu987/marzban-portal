"use client";

import { useActionState, useState } from "react";
import { adminCreateCodes, adminVoidCode } from "../actions";

// 生成兑换码：生成后把码列在文本框里，一键复制
export function CreateCodes({ plans }: { plans: { id: string; name: string; price: string }[] }) {
  const [state, action, pending] = useActionState(adminCreateCodes, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="card bg-base-100 shadow-sm">
      <div className="card-body gap-2 p-4">
        <h2 className="font-bold">生成兑换码</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_6rem_1fr_auto]">
          <select name="plan" required defaultValue="" className="select select-sm w-full">
            <option value="" disabled>
              选套餐
            </option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.price}）
              </option>
            ))}
          </select>
          <input name="count" type="number" min={1} max={100} defaultValue={1} required className="input input-sm w-full" />
          <input name="note" maxLength={100} placeholder="备注，比如「微信转账 张三」" className="input input-sm w-full" />
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => setCopied(false)}>
            生成
          </button>
        </div>
        {state?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>}
        {state?.ok && (
          <div className="flex flex-col gap-1">
            <textarea readOnly value={state.ok} rows={Math.min(10, state.ok.split("\n").length)} className="textarea w-full font-mono text-sm" />
            <button
              type="button"
              className="btn btn-sm self-start"
              onClick={async () => {
                await navigator.clipboard.writeText(state.ok!);
                setCopied(true);
              }}
            >
              {copied ? "已复制 ✓" : "复制全部"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

export function VoidCode({ code, label }: { code: string; label: string }) {
  const [state, action, pending] = useActionState(adminVoidCode, undefined);
  if (state?.ok) return <span className="text-base-content/60">已作废</span>;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`作废兑换码 ${label}？作废后客人就用不了了。`)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="code" value={code} />
      <button className="btn btn-ghost btn-xs" disabled={pending}>
        作废
      </button>
      {state?.error && <span className="ml-1 text-error">{state.error}</span>}
    </form>
  );
}
