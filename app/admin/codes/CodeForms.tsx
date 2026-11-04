"use client";

import { startTransition, useActionState, useState } from "react";
import { adminCreateCodes, adminVoidCode } from "../actions";

// 生成兑换码。分两步选：先选档位（普通版、高速版…），再选时长（7 天体验、月付…，下面写着价格），
// 不用在几十个选项的下拉框里找。天数默认是这个套餐的天数，− / + 加减（比如 7 天体验改成 10 天）；数量同样用 − / +。
// 生成按钮上写清这次要生成什么。生成后给两段直接发给客人的话：只有兑换码的短的，和带用法的长的，各自一键复制
type PlanOption = { id: string; name: string; group: string; period: string; price: string; free: boolean; days: number };

export function CreateCodes({ plans, defaultGroup }: { plans: PlanOption[]; defaultGroup?: string }) {
  const [state, action, pending] = useActionState(adminCreateCodes, undefined);
  const groups = [...new Set(plans.map((p) => p.group))];
  const [group, setGroup] = useState(defaultGroup && groups.includes(defaultGroup) ? defaultGroup : (groups[0] ?? ""));
  const [planId, setPlanId] = useState("");
  const [days, setDays] = useState(0);
  const [count, setCount] = useState(1);
  const plan = plans.find((p) => p.id === planId);
  // 体验排在最前面，最常发
  const periods = plans.filter((p) => p.group === group).sort((a, b) => Number(b.free) - Number(a.free));
  const pick = (p: PlanOption) => {
    setPlanId(p.id);
    setDays(p.days);
  };
  const label = plan ? (days === plan.days ? plan.name : plan.free ? `${plan.group} ${days}天体验` : `${plan.name}（${days} 天）`) : "";
  return (
    // 不用 form action：那样生成完表单会被清空。留着刚才的选择，方便接着再生成
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        startTransition(() => action(f));
      }}
      className="card bg-base-100 shadow-sm"
      data-testid="create-codes"
    >
      <input type="hidden" name="plan" value={planId} />
      <input type="hidden" name="days" value={plan ? days : ""} />
      <input type="hidden" name="count" value={count} />
      <div className="card-body gap-5 p-5">
        <h2 className="text-lg font-bold">生成兑换码</h2>

        <Field label="档位">
          <div className="flex flex-wrap gap-2" role="group" aria-label="档位">
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={g === group}
                onClick={() => {
                  setGroup(g);
                  setPlanId("");
                }}
                className={`btn btn-sm rounded-full ${g === group ? "btn-primary" : "btn-ghost bg-base-200 font-normal"}`}
              >
                {g}
              </button>
            ))}
          </div>
        </Field>

        <Field label="时长">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2" role="group" aria-label="时长">
            {periods.map((p) => {
              const on = p.id === planId;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(p)}
                  className={`flex flex-col items-center gap-0.5 rounded-box border px-2 py-2.5 transition ${
                    on ? "border-primary bg-primary/10 text-primary ring-1 ring-primary" : "border-base-300 hover:border-primary/50 hover:bg-base-200"
                  }`}
                >
                  <span className="text-sm font-medium">{p.period}</span>
                  <span className={`text-xs ${on ? "text-primary/80" : p.free ? "text-success" : "text-base-content/50"}`}>{p.price}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <Field label="天数">
            <Stepper value={days} setValue={setDays} min={1} max={3650} unit="天" disabled={!plan} name="天数" />
          </Field>
          <Field label="数量">
            <Stepper value={count} setValue={setCount} min={1} max={100} unit="个" name="数量" />
          </Field>
          <Field label="备注（选填）" grow>
            <input name="note" maxLength={100} placeholder="比如「微信转账 张三」" className="input input-sm w-full" />
          </Field>
        </div>

        <button className="btn btn-primary" disabled={pending || !plan}>
          {pending && <span className="loading loading-spinner loading-sm" />}
          {plan ? `生成 ${count} 个「${label}」` : "先选时长"}
        </button>

        {state?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>}
        {state?.ok && (
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyBox title="只发兑换码" text={state.short ?? state.ok} testId="code-short" />
            <CopyBox title="带用法的完整说明" text={state.long ?? state.ok} testId="code-long" />
          </div>
        )}
      </div>
    </form>
  );
}

function Field({ label, grow, children }: { label: string; grow?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${grow ? "min-w-48 flex-1" : ""}`}>
      <span className="text-xs font-medium text-base-content/50">{label}</span>
      {children}
    </div>
  );
}

// − 数字 + 的小加减器，数字也能直接改。输入框自带的上下小箭头藏掉，只留 − / + 一套
function Stepper({ value, setValue, min, max, unit, disabled, name }: { value: number; setValue: (n: number) => void; min: number; max: number; unit: string; disabled?: boolean; name: string }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="join">
      <button type="button" className="btn btn-sm join-item w-8 px-0" disabled={disabled || value <= min} onClick={() => setValue(clamp(value - 1))} aria-label={`${name}减一`}>
        −
      </button>
      <label className="input input-sm join-item w-[4.5rem] gap-1 px-2">
        <input
          type="number"
          min={min}
          max={max}
          value={disabled ? "" : value}
          onChange={(e) => setValue(clamp(Math.round(Number(e.target.value)) || min))}
          disabled={disabled}
          aria-label={name}
          className="text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-base-content/40">{unit}</span>
      </label>
      <button type="button" className="btn btn-sm join-item w-8 px-0" disabled={disabled || value >= max} onClick={() => setValue(clamp(value + 1))} aria-label={`${name}加一`}>
        +
      </button>
    </div>
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
      <pre className="max-h-64 overflow-auto rounded-field bg-base-100 p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap select-all">{text}</pre>
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
