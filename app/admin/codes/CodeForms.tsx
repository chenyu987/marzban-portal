"use client";

import { startTransition, useActionState, useState } from "react";
import { adminCreateCodes, adminVoidCode } from "../actions";
import { useT } from "../../LangContext";

// 生成兑换码。分两步选：先选档位（普通版、高速版…），再选时长（7 天体验、月付…，后面写着价格），换档位默认选中体验，
// 不用在几十个选项的下拉框里找。天数默认是这个套餐的天数，− / + 加减（比如 7 天体验改成 10 天）；数量同样用 − / +。
// 生成按钮上写清这次要生成什么。生成后给两段直接发给客人的话：只有兑换码的短的，和带用法的长的，各自一键复制
// group 是档位的键（中文，site.config 里的 Plan.group），groupLabel 是按语言显示的名字
type PlanOption = { id: string; name: string; group: string; groupLabel: string; period: string; price: string; free: boolean; days: number };

export function CreateCodes({ plans, defaultGroup }: { plans: PlanOption[]; defaultGroup?: string }) {
  const [state, action, pending] = useActionState(adminCreateCodes, undefined);
  const t = useT();
  const groups = [...new Set(plans.map((p) => p.group))];
  // 体验排在最前面，最常发。换档位时默认选中它，不会出现「先选时长」的灰按钮
  const periodsOf = (g: string) => plans.filter((p) => p.group === g).sort((a, b) => Number(b.free) - Number(a.free));
  const [group, setGroup] = useState(defaultGroup && groups.includes(defaultGroup) ? defaultGroup : (groups[0] ?? ""));
  const [planId, setPlanId] = useState(() => periodsOf(group)[0]?.id ?? "");
  const [days, setDays] = useState(() => periodsOf(group)[0]?.days ?? 0);
  const [count, setCount] = useState(1);
  const plan = plans.find((p) => p.id === planId);
  const periods = periodsOf(group);
  const pick = (p: PlanOption) => {
    setPlanId(p.id);
    setDays(p.days);
  };
  const label = plan
    ? days === plan.days
      ? plan.name
      : plan.free
        ? t(`${plan.groupLabel} ${days}天体验`, `${plan.groupLabel}, ${days}-day trial`)
        : t(`${plan.name}（${days} 天）`, `${plan.name} (${days} days)`)
    : "";
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
      <div className="card-body gap-0 p-0">
        <h2 className="px-5 pt-5 pb-1 text-lg font-bold">{t("生成兑换码", "Create codes")}</h2>

        {/* 左边一列标签、右边控件，一行一项，对齐成一张表。档位和时长用同一种胶囊，选中的是实心蓝 */}
        <div className="divide-y divide-base-200 px-5">
          <Row label={t("档位", "Tier")}>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("档位", "Tier")}>
              {groups.map((g) => (
                <Chip
                  key={g}
                  on={g === group}
                  onClick={() => {
                    setGroup(g);
                    const first = periodsOf(g)[0];
                    setPlanId(first?.id ?? "");
                    setDays(first?.days ?? 0);
                  }}
                >
                  {plans.find((p) => p.group === g)?.groupLabel ?? g}
                </Chip>
              ))}
            </div>
          </Row>

          <Row label={t("时长", "Length")}>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("时长", "Length")}>
              {periods.map((p) => {
                const on = p.id === planId;
                return (
                  <Chip key={p.id} on={on} onClick={() => pick(p)}>
                    {p.period}
                    <span className={`ml-1.5 text-xs ${on ? "opacity-80" : p.free ? "text-success" : "text-base-content/45"}`}>{p.price}</span>
                  </Chip>
                );
              })}
            </div>
          </Row>

          <Row label={t("天数", "Days")}>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <Stepper value={days} setValue={setDays} min={1} max={3650} unit={t("天", "d")} disabled={!plan} name={t("天数", "Days")} />
              <div className="flex items-center gap-3">
                <span className="text-sm text-base-content/50">{t("数量", "Quantity")}</span>
                <Stepper value={count} setValue={setCount} min={1} max={100} unit={t("个", "")} name={t("数量", "Quantity")} />
              </div>
            </div>
          </Row>

          <Row label={t("备注", "Note")}>
            <input name="note" maxLength={100} placeholder={t("选填，比如「微信转账 张三」", "Optional, e.g. “WeChat transfer, Zhang San”")} aria-label={t("备注", "Note")} className="input input-sm w-full max-w-md" />
          </Row>
        </div>

        {/* 底部一条：左边写清这次生成什么，右边按钮 */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-b-box bg-base-200/60 px-5 py-3">
          <span className="text-sm text-base-content/60">
            {plan ? t(`共 ${count} 个，每个 ${days} 天`, `${count} code${count === 1 ? "" : "s"}, ${days} days each`) : t("先选时长", "Pick a length first")}
          </span>
          <button className="btn btn-primary btn-sm px-5" disabled={pending || !plan}>
            {pending && <span className="loading loading-spinner loading-xs" />}
            {plan ? t(`生成 ${count} 个「${label}」`, `Create ${count} × “${label}”`) : t("生成", "Create")}
          </button>
        </div>

        <div className="flex flex-col gap-3 empty:hidden [&:not(:empty)]:p-5">
        {state?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>}
        {state?.ok && (
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyBox title={t("只发兑换码", "Code only")} text={state.short ?? state.ok} testId="code-short" />
            <CopyBox title={t("带用法的完整说明", "With instructions")} text={state.long ?? state.ok} testId="code-long" />
          </div>
        )}
        </div>
      </div>
    </form>
  );
}

// 表单的一行：左边固定宽的标签，右边控件。窄屏上标签放到上面
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-12 shrink-0 text-sm text-base-content/50">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// 档位、时长共用的胶囊按钮
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`btn btn-sm rounded-full border-0 font-normal ${on ? "btn-primary" : "bg-base-200 text-base-content hover:bg-base-300"}`}
    >
      {children}
    </button>
  );
}

// − 数字 + 的小加减器，数字也能直接改。输入框自带的上下小箭头藏掉，只留 − / + 一套
function Stepper({ value, setValue, min, max, unit, disabled, name }: { value: number; setValue: (n: number) => void; min: number; max: number; unit: string; disabled?: boolean; name: string }) {
  const t = useT();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  // 正在打的字先单独记着：删空了不马上变回最小值，能先删掉 1 再打 30。打出数字就同步上去，离开输入框再按范围收拾
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="join">
      <button type="button" className="btn btn-sm join-item w-8 px-0" disabled={disabled || value <= min} onClick={() => setValue(clamp(value - 1))} aria-label={t(`${name}减一`, `${name} minus one`)}>
        −
      </button>
      <label className="input input-sm join-item w-[4.5rem] gap-1 px-2">
        <input
          type="number"
          min={min}
          max={max}
          value={disabled ? "" : (draft ?? value)}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Math.round(Number(e.target.value));
            if (e.target.value.trim() && Number.isFinite(n)) setValue(clamp(n));
          }}
          onBlur={() => setDraft(null)}
          disabled={disabled}
          aria-label={name}
          className="text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-base-content/40">{unit}</span>
      </label>
      <button type="button" className="btn btn-sm join-item w-8 px-0" disabled={disabled || value >= max} onClick={() => setValue(clamp(value + 1))} aria-label={t(`${name}加一`, `${name} plus one`)}>
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
  const t = useT();
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
          {copied ? t("已复制 ✓", "Copied ✓") : t("复制", "Copy")}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto rounded-field bg-base-100 p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap select-all">{text}</pre>
    </div>
  );
}

export function VoidCode({ code, label }: { code: string; label: string }) {
  const [state, action, pending] = useActionState(adminVoidCode, undefined);
  const t = useT();
  if (state?.ok) return <span className="text-base-content/60">{t("已作废", "Voided")}</span>;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(t(`作废兑换码 ${label}？作废后客人就用不了了。`, `Void code ${label}? Customers won't be able to use it.`))) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="code" value={code} />
      <button className="btn btn-ghost btn-xs" disabled={pending}>
        {t("作废", "Void")}
      </button>
      {state?.error && <span className="ml-1 text-error">{state.error}</span>}
    </form>
  );
}
