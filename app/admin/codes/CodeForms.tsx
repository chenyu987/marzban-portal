"use client";

import { startTransition, useActionState, useState } from "react";
import { adminCreateCodes, adminVoidCode } from "../actions";

// 生成兑换码：选套餐后天数自动填成套餐的天数，可以加减（比如 7 天体验改成 10 天）。下拉框里免费体验排最前面，最常发。
// 生成后给两段直接发给客人的话：只有兑换码的短的，和带用法的长的，各自一键复制
type PlanOption = { id: string; name: string; price: string; free: boolean; days: number };

export function CreateCodes({ plans }: { plans: PlanOption[] }) {
  const [state, action, pending] = useActionState(adminCreateCodes, undefined);
  const [planId, setPlanId] = useState("");
  const [days, setDays] = useState("");
  const plan = plans.find((p) => p.id === planId);
  const n = Number(days);
  const step = (d: number) => setDays(String(Math.max(1, (Number.isInteger(n) && n > 0 ? n : (plan?.days ?? 1)) + d)));
  return (
    // 不用 form action：那样生成完表单会被清空，下拉框变回「选套餐」、天数却还留着，对不上。留着刚才的选择，方便接着再生成
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        startTransition(() => action(f));
      }}
      className="card bg-base-100 shadow-sm"
    >
      <div className="card-body gap-3 p-4">
        <h2 className="font-bold">生成兑换码</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_6rem]">
          <select
            name="plan"
            required
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              setDays(String(plans.find((p) => p.id === e.target.value)?.days ?? ""));
            }}
            aria-label="套餐"
            className="select select-sm w-full"
          >
            <option value="" disabled>
              选套餐
            </option>
            {[
              { label: "免费体验", list: plans.filter((p) => p.free) },
              { label: "付费套餐", list: plans.filter((p) => !p.free) },
            ].map(
              (g) =>
                g.list.length > 0 && (
                  <optgroup key={g.label} label={g.label}>
                    {g.list.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}（{p.price}）
                      </option>
                    ))}
                  </optgroup>
                ),
            )}
          </select>
          {/* 天数：默认是套餐的天数，− / + 一次一天，也能直接改 */}
          <div className="join">
            <button type="button" className="btn btn-sm join-item" disabled={!plan} onClick={() => step(-1)} aria-label="少一天">
              −
            </button>
            <label className="input input-sm join-item w-24">
              <input name="days" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} disabled={!plan} aria-label="天数" />
              <span className="text-base-content/50">天</span>
            </label>
            <button type="button" className="btn btn-sm join-item" disabled={!plan} onClick={() => step(1)} aria-label="多一天">
              +
            </button>
          </div>
          <label className="input input-sm w-full">
            <input name="count" type="number" min={1} max={100} defaultValue={1} required aria-label="数量" />
            <span className="text-base-content/50">个</span>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input name="note" maxLength={100} placeholder="备注，比如「微信转账 张三」" className="input input-sm w-full" />
          <button className="btn btn-primary btn-sm" disabled={pending}>
            生成
          </button>
        </div>
        {plan && Number(days) !== plan.days && days !== "" && (
          <p className="text-sm text-base-content/60" data-testid="days-changed">
            套餐默认 {plan.days} 天，这次生成的是 {days} 天，客人兑换后按 {days} 天开通或续期。
          </p>
        )}
        {state?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>}
        {state?.ok && (
          <div className="mt-1 grid gap-3 sm:grid-cols-2">
            <CopyBox title="只发兑换码" text={state.short ?? state.ok} testId="code-short" />
            <CopyBox title="带用法的完整说明" text={state.long ?? state.ok} testId="code-long" />
          </div>
        )}
      </div>
    </form>
  );
}

// 一段只读文字加「复制」按钮。key 用文字本身：重新生成后「已复制」自动复位
function CopyBox({ title, text, testId }: { title: string; text: string; testId: string }) {
  return <CopyBoxInner key={text} title={title} text={text} testId={testId} />;
}

function CopyBoxInner({ title, text, testId }: { title: string; text: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-box bg-base-200 p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <button
          type="button"
          className="btn btn-primary btn-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? "已复制 ✓" : "复制"}
        </button>
      </div>
      <textarea readOnly value={text} rows={Math.min(12, text.split("\n").length)} className="textarea textarea-sm w-full font-mono text-sm" />
    </div>
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
