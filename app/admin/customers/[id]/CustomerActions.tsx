"use client";

import { useActionState, useState } from "react";
import { adminAdjustBalance, adminBindSubscription, adminDeleteCustomer, adminResetLink } from "../../actions";
import { useT } from "../../../LangContext";

function Alert({ state }: { state?: { error?: string; ok?: string } }) {
  if (state?.error) return <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>;
  if (state?.ok) return <div role="alert" className="alert alert-success alert-soft text-sm">{state.ok}</div>;
  return null;
}

// 客人详情页上的三个操作。改余额会改线上数据，提交前弹框再确认一次
export default function CustomerActions({ customerId, email }: { customerId: number; email: string }) {
  const [adjust, adjustAction, adjusting] = useActionState(adminAdjustBalance, undefined);
  const [reset, resetAction, resetting] = useActionState(adminResetLink, undefined);
  const [bind, bindAction, binding] = useActionState(adminBindSubscription, undefined);
  const [copied, setCopied] = useState(false);
  const t = useT();

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <form
        action={adjustAction}
        onSubmit={(e) => {
          const f = new FormData(e.currentTarget);
          if (!confirm(t(`给 ${email} 的余额 ${f.get("amount")} 元？\n原因：${f.get("note")}`, `Change ${email}'s balance by ${f.get("amount")}?\nReason: ${f.get("note")}`))) e.preventDefault();
        }}
        className="card bg-base-100 shadow-sm"
      >
        <div className="card-body gap-2 p-4">
          <h3 className="font-bold">{t("加减余额", "Adjust balance")}</h3>
          <input type="hidden" name="customerId" value={customerId} />
          <input name="amount" required placeholder={t("金额，扣钱写负数，如 -5", "Amount, negative to deduct, e.g. -5")} inputMode="decimal" className="input input-sm w-full" />
          <input name="note" required maxLength={100} placeholder={t("原因（必填）", "Reason (required)")} className="input input-sm w-full" />
          <button className="btn btn-sm" disabled={adjusting}>
            {t("确定", "Apply")}
          </button>
          <Alert state={adjust} />
        </div>
      </form>

      <form action={resetAction} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-2 p-4">
          <h3 className="font-bold">{t("重置密码链接", "Password reset link")}</h3>
          <p className="text-xs text-base-content/60">
            {t("24 小时有效、只能用一次。先确认是客人本人再发。", "Valid for 24 hours, single use. Make sure it's really the customer before sending.")}
          </p>
          <input type="hidden" name="customerId" value={customerId} />
          <button className="btn btn-sm" disabled={resetting}>
            {t("生成链接", "Create link")}
          </button>
          {reset?.error && <Alert state={reset} />}
          {reset?.ok && (
            <div className="flex flex-col gap-1">
              <code className="break-all rounded-box bg-base-200 p-2 text-xs">{reset.ok}</code>
              <button
                type="button"
                className="btn btn-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(reset.ok!);
                  setCopied(true);
                }}
              >
                {copied ? t("已复制 ✓", "Copied ✓") : t("复制链接", "Copy link")}
              </button>
            </div>
          )}
        </div>
      </form>

      <form action={bindAction} className="card bg-base-100 shadow-sm">
        <div className="card-body gap-2 p-4">
          <h3 className="font-bold">{t("绑定已有订阅", "Link existing subscription")}</h3>
          <p className="text-xs text-base-content/60">{t("把 Marzban 上已有的用户挂到这个客人名下。", "Attach an existing Marzban user to this customer.")}</p>
          <input type="hidden" name="customerId" value={customerId} />
          <input name="username" required placeholder={t("Marzban 用户名", "Marzban username")} autoComplete="off" className="input input-sm w-full" />
          <button className="btn btn-sm" disabled={binding}>
            {t("绑定", "Link")}
          </button>
          <Alert state={bind} />
        </div>
      </form>
    </div>
  );
}

// 删除客人：要输一遍邮箱。名下订阅从 Marzban 删掉、账号注销；订单和余额记录留着
export function DeleteCustomer({ customerId, email, subs }: { customerId: number; email: string; subs: string[] }) {
  const [state, action, pending] = useActionState(adminDeleteCustomer, undefined);
  const t = useT();
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const typed = prompt(
          t(`删除客人 ${email}：\n`, `Delete customer ${email}:\n`) +
            (subs.length
              ? t(
                  `名下 ${subs.length} 个订阅（${subs.join("、")}）会从 Marzban 删掉，马上连不上。\n`,
                  `Their ${subs.length} subscription(s) (${subs.join(", ")}) will be deleted from Marzban and stop working right away.\n`,
                )
              : "") +
            t(
              "账号注销，登录不了；订单和余额记录留着。不能恢复。\n确定要删就输入他的邮箱：",
              "The account is closed and can't log in; orders and balance records are kept. This can't be undone.\nType their email to confirm:",
            ),
        );
        if (typed?.trim().toLowerCase() !== email.toLowerCase()) {
          e.preventDefault();
          return;
        }
        (e.currentTarget.elements.namedItem("confirm") as HTMLInputElement).value = typed.trim();
      }}
      className="card border border-error/40 bg-base-100 shadow-sm"
    >
      <div className="card-body gap-2 p-4">
        <h3 className="font-bold text-error">{t("删除客人", "Delete customer")}</h3>
        <p className="text-xs text-base-content/60">
          {t(
            "名下所有订阅一起从 Marzban 删掉，账号注销。订单、余额、提现记录留着对账，在客人列表选「已删除的」能看到。",
            "All their subscriptions are deleted from Marzban and the account is closed. Orders, balance and withdrawal records stay for bookkeeping; pick “Deleted” in the customer list to see them.",
          )}
        </p>
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="confirm" value="" />
        <button className="btn btn-sm btn-error btn-outline self-start" disabled={pending}>
          {pending && <span className="loading loading-spinner loading-xs" />}
          {subs.length ? t(`删除客人和 ${subs.length} 个订阅`, `Delete customer and ${subs.length} subscription(s)`) : t("删除客人", "Delete customer")}
        </button>
        <Alert state={state} />
      </div>
    </form>
  );
}
