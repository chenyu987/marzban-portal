"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cancelOrder, claimPaid } from "../actions";

export type OpenOrder = {
  id: number;
  planName: string;
  amount: string;
  target: string;
  createdAt: string;
  processing: boolean;
  // 客人点「我已付款」的时间，没点过是 null
  claimedAt: string | null;
};

// 一张没处理完的单：告诉客人付多少、备注写什么，附上收款码；付完点「我已付款」，管理员按这个时间去账单里核对。
// 收款码在浏览器里本地生成
export default function PendingOrder({ order, payments }: { order: OpenOrder; payments: { name: string; qr: string }[] }) {
  const [qrs, setQrs] = useState<string[]>([]);
  const claimed = order.claimedAt !== null;

  useEffect(() => {
    if (!order.processing && !claimed) {
      Promise.all(payments.map((p) => QRCode.toDataURL(p.qr, { width: 200, margin: 1 }))).then(setQrs);
    }
  }, [order.processing, claimed, payments]);

  const badge = order.processing
    ? { text: "正在开通", cls: "badge-info" }
    : claimed
      ? { text: "等管理员核对", cls: "badge-info" }
      : { text: "等你付款", cls: "badge-warning" };

  return (
    <div className="card border border-warning/40 bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <div className="flex items-center justify-between">
          <h2 className="card-title text-base">订单 {order.id}</h2>
          <span className={`badge ${badge.cls}`}>{badge.text}</span>
        </div>
        <p className="text-sm text-base-content/70">
          {order.planName}，{order.amount}，{order.target}，{order.createdAt} 下单
        </p>

        {order.processing ? (
          <p className="text-sm">已经收到你的付款，正在开通，好了之后在「我的订阅」里就能看到。</p>
        ) : claimed ? (
          <p className="text-sm">你在 {order.claimedAt} 告诉我们已经付款了。管理员核对到这笔钱后就会开通，开通好了在「我的订阅」里就能看到。</p>
        ) : (
          <>
            <div className="rounded-box bg-base-200 p-3 text-sm leading-relaxed">
              请转账 <b className="text-lg">{order.amount}</b>，转账备注写订单号 <b className="text-lg">{order.id}</b>。
              <br />
              付完款回到这里点「我已付款」，管理员核对到就会帮你开通。
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
            <form action={claimPaid}>
              <input type="hidden" name="id" value={order.id} />
              <button className="btn btn-primary w-full">我已付款</button>
            </form>
            <form
              action={cancelOrder}
              onSubmit={(e) => {
                if (!confirm("已经付过款的单不要取消。确定取消这张单吗？")) e.preventDefault();
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
