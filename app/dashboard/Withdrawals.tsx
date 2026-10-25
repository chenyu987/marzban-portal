"use client";

import { useActionState } from "react";
import { cancelWithdrawal, requestWithdrawal } from "../actions";

export type WithdrawalRow = { id: number; amount: string; account: string; status: string; date: string; note: string | null };

const STATUS: Record<string, { text: string; badge: string }> = {
  pending: { text: "等管理员打款", badge: "badge-warning" },
  paid: { text: "已打款", badge: "badge-success" },
  rejected: { text: "没通过，余额已退回", badge: "badge-error" },
  cancelled: { text: "已取消，余额已退回", badge: "badge-ghost" },
};

// 余额提现：没有在处理的申请、而且有余额时显示申请表单；下面是最近的提现记录
export default function Withdrawals({
  balance,
  balanceYuan,
  rows,
}: {
  balance: number;
  balanceYuan: string;
  rows: WithdrawalRow[];
}) {
  const [state, action, pending] = useActionState(requestWithdrawal, undefined);
  const hasPending = rows.some((r) => r.status === "pending");

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title">提现</h2>
        {!hasPending && balance > 0 && (
          <form action={action} className="flex flex-col gap-2">
            <p className="text-sm text-base-content/70">余额提到你的支付宝，管理员手动转账，一般一两天内到。</p>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-base-content/70">金额（元）</span>
              <input name="amount" required inputMode="decimal" defaultValue={balanceYuan} className="input w-full" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-base-content/70">支付宝账号（手机号或邮箱）</span>
              <input name="account" required maxLength={64} autoComplete="off" className="input w-full" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-base-content/70">支付宝实名</span>
              <input name="name" required maxLength={20} autoComplete="off" className="input w-full" />
            </label>
            <button className="btn btn-primary" disabled={pending}>
              {pending && <span className="loading loading-spinner loading-sm" />}
              申请提现
            </button>
          </form>
        )}
        {!hasPending && balance <= 0 && rows.length === 0 && <p className="text-sm text-base-content/60">有余额后可以在这里申请提现到支付宝。</p>}
        {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
        {state?.ok && <div role="alert" className="alert alert-success alert-soft">{state.ok}</div>}

        {rows.length > 0 && (
          <ul className="divide-y divide-base-200 text-sm">
            {rows.map((r) => {
              const s = STATUS[r.status] ?? { text: r.status, badge: "badge-ghost" };
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {r.date} 提现 {r.amount} 到 {r.account}
                    {r.note && <span className="text-base-content/60">（{r.note}）</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`badge ${s.badge}`}>{s.text}</span>
                    {r.status === "pending" && (
                      <form
                        action={cancelWithdrawal}
                        onSubmit={(e) => {
                          if (!confirm("取消这笔提现？余额会退回。")) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn btn-ghost btn-xs">取消</button>
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
