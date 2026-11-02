"use client";

import { useActionState } from "react";
import { adminRevokeOrder, adminVerifyOrder } from "./actions";

// 已开通、待对账的单：在账单里找到钱就「确认到账」，找不到就「没收到钱」把订阅收回。两个都先弹框再确认一次
export default function VerifyActions({ id, summary, isNew }: { id: number; summary: string; isNew: boolean }) {
  const [verifyState, verifyAction, verifying] = useActionState(adminVerifyOrder, undefined);
  const [revokeState, revokeAction, revoking] = useActionState(adminRevokeOrder, undefined);
  const state = verifyState ?? revokeState;
  const done = !!state?.ok;
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-wrap gap-2 ${done ? "hidden" : ""}`}>
        <form
          action={verifyAction}
          onSubmit={(e) => {
            if (!confirm(`在账单里找到这笔钱了？\n\n${summary}`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button className="btn btn-primary btn-sm" disabled={verifying || revoking}>
            {verifying && <span className="loading loading-spinner loading-xs" />}
            确认到账
          </button>
        </form>
        <form
          action={revokeAction}
          onSubmit={(e) => {
            const what = isNew ? "这个订阅会被停用" : "这次续上的天数会扣回去";
            if (!confirm(`确定没收到钱？${what}，推荐奖励收回，抵扣的余额退回。\n\n${summary}`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button className="btn btn-error btn-outline btn-sm" disabled={verifying || revoking}>
            {revoking && <span className="loading loading-spinner loading-xs" />}
            没收到钱，收回
          </button>
        </form>
      </div>
      {state?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>}
      {state?.ok && <div role="alert" className="alert alert-success alert-soft text-sm">{state.ok}</div>}
    </div>
  );
}
