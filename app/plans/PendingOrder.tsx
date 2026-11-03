"use client";

import { useActionState, useEffect, useState } from "react";
import QRCode from "qrcode";
import { cancelOrder, claimPaid } from "../actions";
import { confirmSubmit } from "../ConfirmDialog";

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

// 一张没处理完的单：告诉客人付多少、备注写什么，附上收款码。付完点「我已付款」（选用哪个付的、填付款人）马上开通，
// 管理员之后按这个时间、金额和付款人去账单里对账。收款码在浏览器里本地生成
export default function PendingOrder({ order, payments }: { order: OpenOrder; payments: { name: string; qr: string }[] }) {
  const [qrs, setQrs] = useState<string[]>([]);
  const [state, claimAction, claiming] = useActionState(claimPaid, undefined);
  const claimed = order.claimedAt !== null;

  useEffect(() => {
    if (!order.processing && !claimed) {
      Promise.all(payments.map((p) => QRCode.toDataURL(p.qr, { width: 200, margin: 1 }))).then(setQrs);
    }
  }, [order.processing, claimed, payments]);

  const badge = order.processing
    ? { text: "正在开通", cls: "badge-info" }
    : claimed
      ? { text: "等管理员开通", cls: "badge-info" }
      : { text: "等你付款", cls: "badge-warning" };

  return (
    <div className="card border border-warning/40 bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <div className="flex items-center justify-between">
          <h2 className="card-title text-base">订单 {order.no}</h2>
          <span className={`badge ${badge.cls}`}>{badge.text}</span>
        </div>
        <p className="text-sm text-base-content/70">
          {order.planName}，{order.target}，{order.createdAt} 下单{order.deducted && `，已用余额抵扣 ${order.deducted}`}
        </p>

        {order.processing ? (
          <p className="text-sm">已经收到你的付款，正在开通，好了之后在「我的订阅」里就能看到。</p>
        ) : claimed ? (
          <>
            {state?.error && <div role="alert" className="alert alert-warning alert-soft text-sm">{state.error}</div>}
            <p className="text-sm">你在 {order.claimedAt} 告诉我们已经付款了，自动开通没成功，管理员会尽快帮你开通。开通好了在「我的订阅」里就能看到。</p>
          </>
        ) : (
          <>
            <div className="rounded-box bg-base-200 p-3 text-sm leading-relaxed">
              请转账 <b className="text-lg">{order.amount}</b>，转账备注写订单号 <b className="text-lg">{order.no}</b>。
              <br />
              {order.deducted && <>已经用余额抵扣了 {order.deducted}，只要转剩下的。</>}付完款回到这里点「我已付款」，马上就能用。
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              {payments.map((p, i) => (
                <div key={p.name} className="flex flex-col items-center gap-1">
                  {qrs[i] ? (
                    <img src={qrs[i]} alt={`${p.name}收款码`} width={200} height={200} />
                  ) : (
                    <span className="loading loading-spinner" />
                  )}
                  <span className="text-sm font-bold">{p.name}</span>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-base-content/60">在手机上看这个页面的话，可以截图，再到对应的 App 里扫一扫、从相册选图</p>
            <form action={claimAction} className="flex flex-col gap-2 rounded-box border border-base-300 p-3">
              <input type="hidden" name="id" value={order.id} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span>用哪个付的：</span>
                {payments.map((p) => (
                  <label key={p.name} className="flex cursor-pointer items-center gap-1">
                    <input
                      type="radio"
                      name="payMethod"
                      value={p.name}
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
                placeholder="付款人昵称或名字（选填）"
                aria-label="付款人"
                className="input input-sm w-full"
              />
              {state?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>}
              <button className="btn btn-primary w-full" disabled={claiming}>
                {claiming && <span className="loading loading-spinner loading-xs" />}
                我已付款
              </button>
            </form>
            <form
              action={cancelOrder}
              onSubmit={(e) => {
                confirmSubmit(e, `已经付过款的单不要取消。确定取消这张单吗？${order.deducted ? "抵扣的余额会退回。" : ""}`, { ok: "取消这张单", danger: true });
              }}
            >
              <input type="hidden" name="id" value={order.id} />
              <button className="btn btn-ghost btn-sm">取消这张单</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
