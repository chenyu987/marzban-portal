"use client";

import { Fragment, useActionState, useState } from "react";
import { createOrder } from "../actions";
import ContactSupport from "../ContactSupport";

export type PlanGroup = {
  name: string;
  title: string;
  lines: string[];
  accent?: boolean;
  highlight?: "hot" | "top";
  // price：带币种的价格，确认框里用；amount：价目表上的数字；fen：价格（分），用余额抵扣时算还要付多少
  plans: { id: string; label: string; name: string; price: string; amount: string; fen: number; days: number; tag?: string }[];
};

// 「月付」→「/月」，跟在价格后面
const per = (label: string) => (label.endsWith("付") ? `/${label.slice(0, -1)}` : "");

// 价目表照 Canva 上的原版：一行一档，名字、说明、四个价格各占一格，格子之间有线。
// 手机上放不下六列，名字和说明占一行，四个价格排在下一行

// 套餐价目表。能买时每个价格都是一个按钮，点了先确认再下单。
// 有余额时默认勾选「用余额抵扣」：余额够付全款就马上开通；不够就抵扣一部分，剩下的转账。
// 没配收款码时只能靠余额付全款；既没收款码也没余额时只是价目表
export default function OrderForm({
  groups,
  subscriptions,
  canTransfer,
  balance,
  currency,
  defaultTarget,
}: {
  groups: PlanGroup[];
  subscriptions: { username: string; label: string }[];
  canTransfer: boolean;
  balance: number;
  currency: string;
  defaultTarget?: string;
}) {
  const [state, action, pending] = useActionState(createOrder, undefined);
  const [useBalance, setUseBalance] = useState(balance > 0);
  const deduct = useBalance ? balance : 0;
  const canOrder = canTransfer || balance > 0;
  const money = (fen: number) => `${currency}${(fen / 100).toFixed(2).replace(/\.00$/, "")}`;
  // 周期按第一档的顺序（月付、季付、半年付、年付）；默认月付
  const periods = groups[0]?.plans.map((p) => p.label) ?? [];
  const [period, setPeriod] = useState(0);
  // 每个周期最多能省百分之几（按各档比按月买省得最多的算），写在周期按钮上
  const bestSave = periods.map((_, i) =>
    Math.max(
      0,
      ...groups.map((g) => {
        const p = g.plans[i];
        const m = g.plans[0];
        if (!p || !m) return 0;
        const months = Math.max(1, Math.round(p.days / 30));
        return 1 - p.fen / (m.fen * months);
      }),
    ),
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (!btn) return e.preventDefault();
        const fen = Number(btn.dataset.fen);
        const target = new FormData(e.currentTarget).get("target");
        const what = !target || target === "new" ? "新开一个订阅" : `给订阅 ${subscriptions.find((s) => s.username === target)?.label ?? target} 续期`;
        const how =
          deduct >= fen
            ? "全部用余额付，马上开通"
            : deduct > 0
              ? `余额抵扣 ${money(deduct)}，还要转账 ${money(fen - deduct)}`
              : "下单后转账";
        if (!confirm(`${btn.dataset.name}，${btn.dataset.price}，${what}。${how}。确定吗？`)) e.preventDefault();
      }}
      className="flex flex-col gap-4"
    >
      {balance > 0 && (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name="useBalance"
            value="1"
            checked={useBalance}
            onChange={(e) => setUseBalance(e.target.checked)}
            className="checkbox checkbox-primary checkbox-sm"
          />
          <span>用余额抵扣（剩 {money(balance)}）</span>
        </label>
      )}
      {canOrder && subscriptions.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">买给哪个订阅</span>
          <select name="target" className="select w-full" defaultValue={defaultTarget ?? subscriptions[0].username}>
            {subscriptions.map((s) => (
              <option key={s.username} value={s.username}>
                给订阅 {s.label} 续期
              </option>
            ))}
            <option value="new">新开一个订阅</option>
          </select>
        </label>
      )}
      {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
      {state?.error?.includes("联系客服") && <ContactSupport />}
      {state?.ok && <div role="alert" className="alert alert-success alert-soft">{state.ok}</div>}

      {/* 周期切换：同一档的月付、季付……按周期看，旁边写比按月买省多少 */}
      <div role="tablist" className="tabs tabs-box self-center">
        {periods.map((label, i) => (
          <button key={label} type="button" role="tab" className={`tab ${i === period ? "tab-active" : ""}`} onClick={() => setPeriod(i)}>
            {label}
            {bestSave[i] > 0 && <span className="ml-1 text-xs text-success">省{Math.round(bestSave[i] * 100)}%</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="plan-cards">
        {groups.map((g) => {
          const p = g.plans[period] ?? g.plans[0];
          const month = g.plans[0];
          const months = Math.max(1, Math.round(p.days / 30));
          const save = month.fen * months - p.fen;
          const hot = g.highlight === "hot";
          const top = g.highlight === "top";
          return (
            <div
              key={g.name}
              className={`relative flex flex-col rounded-box bg-base-100 p-5 shadow-sm ${hot ? "ring-2 ring-primary" : "border border-base-300/70"}`}
            >
              {(hot || top) && <span className={`badge absolute -top-3 left-5 ${hot ? "badge-primary" : "badge-accent"}`}>{hot ? "最受欢迎" : "旗舰"}</span>}
              <h3 className="text-lg font-bold">{g.name}</h3>
              <p className="text-sm text-base-content/60">{g.lines.at(-1)}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold">{money(p.fen)}</span>
                <span className="text-base-content/60">{per(p.label)}</span>
              </div>
              <div className="min-h-5 text-sm">
                {months > 1 && <span className="text-base-content/60">折合 {money(Math.round(p.fen / months))}/月</span>}
                {save > 0 && <span className="ml-2 text-success">比按月买省 {money(save)}</span>}
              </div>
              {p.tag && <span className="mt-1 text-xs text-error">{p.tag}</span>}
              <div className="flex-1" />
              {canOrder ? (
                <button
                  name="plan"
                  value={p.id}
                  data-name={p.name}
                  data-price={p.price}
                  data-fen={p.fen}
                  disabled={pending || (!canTransfer && deduct < p.fen)}
                  className={`btn mt-4 ${hot ? "btn-primary" : "btn-outline"}`}
                >
                  {pending && <span className="loading loading-spinner loading-xs" />}
                  {deduct >= p.fen ? "用余额买，马上开通" : "下单"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 原版价目表（照 Canva 上的排法）：只看，下单在上面的卡片上点 */}
      <details className="text-sm">
        <summary className="cursor-pointer text-base-content/60">看完整价目表</summary>
        <div className="mt-2">
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 sm:grid-cols-[6rem_1.7fr_repeat(4,1fr)]">
        {groups.map((g) => {
          const hot = g.highlight === "hot";
          const top = g.highlight === "top";
          return (
            <Fragment key={g.name}>
              <div
                className={`flex flex-col items-center justify-center p-2 text-center font-bold ${hot ? "bg-error text-error-content" : "bg-base-100"} ${top ? "text-error" : ""}`}
              >
                {hot && <span className="text-xs leading-none">hot</span>}
                {top && <span className="text-xs leading-none">👑</span>}
                {g.title}
              </div>
              <div className="col-span-3 flex flex-col items-center justify-center bg-base-100 p-2 text-center text-sm sm:col-span-1">
                {g.lines.map((l, i) => (
                  <span key={l} className={top || (g.accent && i === 0) ? "text-error" : ""}>
                    {l}
                  </span>
                ))}
              </div>
              {g.plans.map((p) => {
                const inner = (
                  <>
                    {p.tag && <span className="text-xs leading-tight text-error">{p.tag}</span>}
                    <span className={`whitespace-nowrap ${top ? "font-bold text-error" : ""}`}>
                      {p.amount}
                      {per(p.label)}
                    </span>
                  </>
                );
                const cell = "flex min-h-14 flex-col items-center justify-center bg-base-100 px-1 py-2 text-center";
                return (
                  <div key={p.id} className={cell}>
                    {inner}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
        </div>
      </details>
    </form>
  );
}
