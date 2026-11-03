"use client";

import { useActionState, useEffect, useState } from "react";
import QRCode from "qrcode";
import { cancelOrder, claimPaid } from "../actions";
import { confirmSubmit } from "../ConfirmDialog";
import { useT } from "../LangContext";

export type OpenOrder = {
  no: string; // 给客人看的订单号，转账备注填这个
  id: number;
  planName: string;
  // 还要转账的金额（已经减掉余额抵扣）
  amount: string;
  // 用余额抵扣了多少，没抵扣是 null
  deducted: string | null;
  target: string;
  createdAt: string;
  processing: boolean;
  // 客人点「我已付款」的时间，没点过是 null
  claimedAt: string | null;
};

// 刚下的单：订单卡片出现在价目表上面，手机上客人还停在价目表那里看不到，所以弹出来。
// 下单的表单和这张卡片是两个组件，谁先挂上不一定：先记进 sessionStorage，再发个事件，卡片两头都看
const NEW_ORDER_KEY = "new-order";
const NEW_ORDER_EVENT = "new-order";
export function announceNewOrder(id: number) {
  try {
    sessionStorage.setItem(NEW_ORDER_KEY, String(id));
  } catch {
    // 存不了也没关系，下面的事件照样发
  }
  window.dispatchEvent(new CustomEvent(NEW_ORDER_EVENT, { detail: id }));
}

// 一张没处理完的单：告诉客人付多少、备注写什么，附上收款码。付完点「我已付款」（选用哪个付的、填付款人）马上开通，
// 管理员之后按这个时间、金额和付款人去账单里对账。收款码在浏览器里本地生成。
// payments：value 是提交给后端的付款方式（中文名，后台对账看），name 是显示给客人的
export default function PendingOrder({ order, payments }: { order: OpenOrder; payments: { value: string; name: string; qr: string }[] }) {
  const t = useT();
  const [qrs, setQrs] = useState<string[]>([]);
  const [state, claimAction, claiming] = useActionState(claimPaid, undefined);
  const claimed = order.claimedAt !== null;
  const [popup, setPopup] = useState(false);

  // 这张单是刚下的：手机上弹出付款窗（宽屏一眼就看得到，不用弹）
  useEffect(() => {
    const show = () => {
      try {
        sessionStorage.removeItem(NEW_ORDER_KEY);
      } catch {}
      if (window.matchMedia("(max-width: 639px)").matches) setPopup(true);
    };
    try {
      if (sessionStorage.getItem(NEW_ORDER_KEY) === String(order.id)) show();
    } catch {}
    const onNew = (e: Event) => (e as CustomEvent<number>).detail === order.id && show();
    window.addEventListener(NEW_ORDER_EVENT, onNew);
    return () => window.removeEventListener(NEW_ORDER_EVENT, onNew);
  }, [order.id]);

  // 弹窗开着时后面的页面不跟着滚，Esc 关掉
  useEffect(() => {
    if (!popup) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPopup(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [popup]);

  useEffect(() => {
    if (!order.processing && !claimed) {
      Promise.all(payments.map((p) => QRCode.toDataURL(p.qr, { width: 200, margin: 1 }))).then(setQrs);
    }
  }, [order.processing, claimed, payments]);

  const badge = order.processing
    ? { text: t("正在开通", "Activating"), cls: "badge-info" }
    : claimed
      ? { text: t("等管理员开通", "Waiting for support"), cls: "badge-info" }
      : { text: t("等你付款", "Awaiting payment"), cls: "badge-warning" };

  const card = (
    <div className={`card bg-base-100 ${popup ? "" : "border border-warning/40 shadow-sm"}`}>
      <div className="card-body gap-3">
        <div className="flex items-center justify-between">
          <h2 className="card-title text-base">{t("订单", "Order")} {order.no}</h2>
          <span className={`badge ${badge.cls}`}>{badge.text}</span>
        </div>
        <p className="text-sm text-base-content/70">
          {t(
            `${order.planName}，${order.target}，${order.createdAt} 下单${order.deducted ? `，已用余额抵扣 ${order.deducted}` : ""}`,
            `${order.planName}, ${order.target}, ordered ${order.createdAt}${order.deducted ? `, ${order.deducted} paid from balance` : ""}`,
          )}
        </p>

        {order.processing ? (
          <p className="text-sm">
            {t("已经收到你的付款，正在开通，好了之后在「我的订阅」里就能看到。", "We've received your payment and are activating it. It'll show up under My subscription when ready.")}
          </p>
        ) : claimed ? (
          <>
            {state?.error && <div role="alert" className="alert alert-warning alert-soft text-sm">{state.error}</div>}
            <p className="text-sm">
              {t(
                `你在 ${order.claimedAt} 告诉我们已经付款了，自动开通没成功，管理员会尽快帮你开通。开通好了在「我的订阅」里就能看到。`,
                `You told us you paid at ${order.claimedAt}, but automatic activation failed. Support will activate it shortly; it'll show up under My subscription.`,
              )}
            </p>
          </>
        ) : (
          <>
            <div className="rounded-box bg-base-200 p-3 text-sm leading-relaxed">
              {t("请转账 ", "Please pay ")}
              <b className="text-lg">{order.amount}</b>
              {t("，转账备注写订单号 ", " and put the order number ")}
              <b className="text-lg">{order.no}</b>
              {t("。", " in the payment note.")}
              <br />
              {order.deducted && t(`已经用余额抵扣了 ${order.deducted}，只要转剩下的。`, `${order.deducted} was already paid from your balance; just pay the rest. `)}
              {t("付完款回到这里点「我已付款」，马上就能用。", "After paying, come back and tap \"I've paid\" to start using it right away.")}
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              {payments.map((p, i) => (
                <div key={p.value} className="flex flex-col items-center gap-1">
                  {qrs[i] ? (
                    <img src={qrs[i]} alt={t(`${p.name}收款码`, `${p.name} QR code`)} width={200} height={200} />
                  ) : (
                    <span className="loading loading-spinner" />
                  )}
                  <span className="text-sm font-bold">{p.name}</span>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-base-content/60">
              {t(
                "在手机上看这个页面的话，可以截图，再到对应的 App 里扫一扫、从相册选图",
                "On a phone? Take a screenshot, then open the app's scanner and pick the image from your photos",
              )}
            </p>
            <form action={claimAction} className="flex flex-col gap-2 rounded-box border border-base-300 p-3">
              <input type="hidden" name="id" value={order.id} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span>{t("用哪个付的：", "Paid with:")}</span>
                {payments.map((p) => (
                  <label key={p.value} className="flex cursor-pointer items-center gap-1">
                    <input
                      type="radio"
                      name="payMethod"
                      value={p.value}
                      required
                      defaultChecked={payments.length === 1}
                      className="radio radio-primary radio-sm"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
              <input
                name="payer"
                maxLength={40}
                placeholder={t("付款人昵称或名字（选填）", "Payer nickname or name (optional)")}
                aria-label={t("付款人", "Payer")}
                className="input input-sm w-full"
              />
              {state?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>}
              <button className="btn btn-primary w-full" disabled={claiming}>
                {claiming && <span className="loading loading-spinner loading-xs" />}
                {t("我已付款", "I've paid")}
              </button>
            </form>
            <form
              action={cancelOrder}
              onSubmit={(e) => {
                confirmSubmit(
                  e,
                  t(
                    `已经付过款的单不要取消。确定取消这张单吗？${order.deducted ? "抵扣的余额会退回。" : ""}`,
                    `Don't cancel an order you've already paid for. Cancel this order?${order.deducted ? " The balance you used will be refunded." : ""}`,
                  ),
                  { ok: t("取消这张单", "Cancel order"), danger: true },
                );
              }}
            >
              <input type="hidden" name="id" value={order.id} />
              <button className="btn btn-ghost btn-sm">{t("取消这张单", "Cancel order")}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );

  if (!popup) return card;
  // 手机上的付款窗：从底部滑上来，点右上角 × 或背景收起来，单子还在页面上
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={(e) => e.target === e.currentTarget && setPopup(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("付款", "Payment")}
        className="sheet-up max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-base-100 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-base-100 px-4 pt-3">
          <b>{t("下单成功，请付款", "Order placed. Please pay")}</b>
          <button type="button" onClick={() => setPopup(false)} aria-label={t("关闭", "Close")} className="btn btn-ghost btn-square btn-sm -mr-1">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {card}
      </div>
    </div>
  );
}
