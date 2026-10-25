"use client";

import { useActionState } from "react";
import { adminCancelOrder, adminConfirmOrder } from "./actions";

// 确认收款、取消都是会改线上数据的操作：点了先弹框，写清楚金额和要做什么，再确认一次
export default function OrderActions({ id, summary }: { id: number; summary: string }) {
  const [confirmState, confirmAction, confirming] = useActionState(adminConfirmOrder, undefined);
  const [cancelState, cancelAction, cancelling] = useActionState(adminCancelOrder, undefined);
  const state = confirmState ?? cancelState;
  // 处理成功后按钮就不要了，免得再点一次
  const done = !!state?.ok;
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-wrap gap-2 ${done ? "hidden" : ""}`}>
        <form
          action={confirmAction}
          onSubmit={(e) => {
            if (!confirm(`确认已经收到钱，开通这张单？\n\n${summary}`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button className="btn btn-primary btn-sm" disabled={confirming || cancelling}>
            {confirming && <span className="loading loading-spinner loading-xs" />}
            确认收款并开通
          </button>
        </form>
        <form
          action={cancelAction}
          onSubmit={(e) => {
            if (!confirm(`取消这张单？抵扣的余额会退回客人。\n\n${summary}`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button className="btn btn-ghost btn-sm" disabled={confirming || cancelling}>
            取消
          </button>
        </form>
      </div>
      {state?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>}
      {state?.ok && <div role="alert" className="alert alert-success alert-soft text-sm">{state.ok}</div>}
    </div>
  );
}
