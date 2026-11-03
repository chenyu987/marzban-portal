"use client";

import { Fragment, useActionState, useEffect, useState } from "react";
import { createOrder } from "../actions";
import ContactSupport from "../ContactSupport";
import { confirmSubmit } from "../ConfirmDialog";
import { useT } from "../LangContext";
import { announceNewOrder } from "./PendingOrder";

export type PlanGroup = {
  name: string;
  title: string;
  lines: string[];
  accent?: boolean;
  highlight?: "hot" | "top";
  // price：带币种的价格，确认框里用；amount：价目表上的数字；per：跟在价格后面的「/月」；fen：价格（分），用余额抵扣时算还要付多少
  plans: { id: string; name: string; per: string; price: string; amount: string; fen: number; days: number; tag?: string }[];
};

// 价目表照 Canva 上的原版：一行一档，名字、说明、四个价格各占一格，格子之间有线。
// 手机上放不下六列，名字和说明占一行，四个价格排在下一行

// 套餐价目表。能买时每个价格格子都是一个按钮：鼠标移上去变色、价格放大、底部浮出「下单」；只用 transform 和绝对定位，不改格子大小，表格不会跳，点了先确认再下单。
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
  const t = useT();
  const renewText = (label: string) => t(`给订阅 ${label} 续期`, `Renew subscription ${label}`);
  const deduct = useBalance ? balance : 0;
  const canOrder = canTransfer || balance > 0;
  // 刚下的单交给 PendingOrder：手机上弹出付款窗
  useEffect(() => {
    if (state?.orderId) announceNewOrder(state.orderId);
  }, [state]);
  const money = (fen: number) => `${currency}${(fen / 100).toFixed(2).replace(/\.00$/, "")}`;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (e.currentTarget.dataset.confirmed === "1") return confirmSubmit(e, "");
        const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (!btn) return e.preventDefault();
        const fen = Number(btn.dataset.fen);
        const target = new FormData(e.currentTarget).get("target");
        const what =
          !target || target === "new" ? t("新开一个订阅", "New subscription") : renewText(subscriptions.find((s) => s.username === target)?.label ?? String(target));
        const how =
          deduct >= fen
            ? t("全部用余额付，马上开通", "Paid in full with your balance, activated right away")
            : deduct > 0
              ? t(`余额抵扣 ${money(deduct)}，还要转账 ${money(fen - deduct)}`, `${money(deduct)} from your balance, ${money(fen - deduct)} left to pay`)
              : t("下单后转账", "Pay by transfer after ordering");
        confirmSubmit(e, t(`${btn.dataset.name}，${btn.dataset.price}\n${what}。${how}。`, `${btn.dataset.name}, ${btn.dataset.price}\n${what}. ${how}.`), {
          ok: t("确定下单", "Place order"),
        });
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
          <span>{t(`用余额抵扣（剩 ${money(balance)}）`, `Use my balance (${money(balance)} left)`)}</span>
        </label>
      )}
      {/* 续期还是新开：只有一个订阅时两个选项左右并排，一眼看到；订阅多了再收进下拉框 */}
      {canOrder && subscriptions.length === 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-base-content/70">{t("买给哪个订阅", "Which subscription is this for?")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: subscriptions[0].username, title: renewText(subscriptions[0].label), desc: t("时长接着加，链接不变", "Adds time, same link") },
              { value: "new", title: t("新开一个订阅", "New subscription"), desc: t("多一条订阅链接，给家人或别的设备用", "A second link for family or another device") },
            ].map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 bg-base-100 p-3 transition hover:border-primary/60 has-checked:border-primary has-checked:bg-primary/5 has-checked:ring-1 has-checked:ring-primary"
              >
                <input type="radio" name="target" value={o.value} defaultChecked={o.value === (defaultTarget ?? subscriptions[0].username)} className="radio radio-primary radio-sm mt-0.5" />
                <span className="flex flex-col">
                  <span className="font-semibold">{o.title}</span>
                  <span className="text-xs text-base-content/60">{o.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {canOrder && subscriptions.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-base-content/70">{t("买给哪个订阅", "Which subscription is this for?")}</span>
          <select name="target" className="select w-full" defaultValue={defaultTarget ?? subscriptions[0].username}>
            {subscriptions.map((s) => (
              <option key={s.username} value={s.username}>
                {renewText(s.label)}
              </option>
            ))}
            <option value="new">{t("新开一个订阅", "New subscription")}</option>
          </select>
        </label>
      )}
      {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
      {state?.support && <ContactSupport />}
      {state?.ok && <div role="alert" className="alert alert-success alert-soft">{state.ok}</div>}

      {canOrder && <p className="text-center text-sm text-base-content/60 sm:hidden">{t("点价格就能下单", "Tap a price to order")}</p>}
      <div data-testid="plan-table" className="grid grid-cols-4 gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 sm:grid-cols-[6rem_1.7fr_repeat(4,1fr)]">
        {groups.map((g, gi) => {
          const hot = g.highlight === "hot";
          const top = g.highlight === "top";
          return (
            <Fragment key={g.name}>
              {/* 手机上套餐之间的线深一点：一个套餐占两行（名字一行、四个价格一行），线都一样的话分不清哪行价格是哪个套餐的。
                  -my-px 让它盖住上下两道格子缝，看起来就是一道 2px 的深色线；宽屏一个套餐一行，不需要 */}
              {gi > 0 && <div aria-hidden className="col-span-full -my-px h-0.5 bg-base-content/45 sm:hidden" />}
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
                      {p.per}
                    </span>
                  </>
                );
                const cell = "flex min-h-14 flex-col items-center justify-center bg-base-100 px-1 py-2 text-center";
                if (!canOrder)
                  return (
                    <div key={p.id} className={cell}>
                      {inner}
                    </div>
                  );
                return (
                  <button
                    key={p.id}
                    name="plan"
                    value={p.id}
                    data-name={p.name}
                    data-price={p.price}
                    data-fen={p.fen}
                    disabled={pending || (!canTransfer && deduct < p.fen)}
                    title={t(`${p.name} ${p.price}，点击下单`, `${p.name} ${p.price}, click to order`)}
                    className={`group relative ${cell} cursor-pointer transition-colors duration-200 hover:bg-primary hover:text-primary-content focus-visible:bg-primary focus-visible:text-primary-content focus-visible:outline-none active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-base-100 disabled:hover:text-inherit`}
                  >
                    <span className="flex flex-col items-center transition-transform duration-200 group-hover:-translate-y-1.5 group-hover:scale-115 group-focus-visible:-translate-y-1.5 group-focus-visible:scale-115 group-disabled:transform-none group-hover:[&_*]:text-inherit group-focus-visible:[&_*]:text-inherit">
                      {inner}
                    </span>
                    <span className="pointer-events-none absolute inset-x-0 bottom-1 translate-y-1 text-[11px] leading-none font-semibold opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 group-disabled:hidden">
                      {deduct >= p.fen ? t("余额付 →", "Pay with balance →") : t("下单 →", "Order →")}
                    </span>
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </form>
  );
}
