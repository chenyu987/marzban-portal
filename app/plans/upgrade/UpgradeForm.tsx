"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createUpgradeOrder } from "../../actions";
import ContactSupport from "../../ContactSupport";
import { useT } from "../../LangContext";
import { announceNewOrder } from "../PendingOrder";

type Option = { id: string; name: string; desc: string; monthly: string; fen: number };

// 升级页：选一个更高的档，下面显示要补多少钱。余额够就直接升级；不够就下一张转账单，跳到套餐页按平常的方式付款
export default function UpgradeForm({
  username,
  daysLeft,
  currentMonthly,
  options,
  balance,
  canTransfer,
  currency,
}: {
  username: string;
  daysLeft: number;
  currentMonthly: string;
  options: Option[];
  balance: number;
  canTransfer: boolean;
  currency: string;
}) {
  const t = useT();
  const router = useRouter();
  const [state, action, pending] = useActionState(createUpgradeOrder, undefined);
  const [sel, setSel] = useState(options[0].id);
  const [useBalance, setUseBalance] = useState(balance > 0);
  const chosen = options.find((o) => o.id === sel) ?? options[0];
  const money = (fen: number) => `${currency}${(fen / 100).toFixed(2).replace(/\.00$/, "")}`;
  const deduct = useBalance ? Math.min(balance, chosen.fen) : 0;
  const due = chosen.fen - deduct;
  const canPay = due === 0 || canTransfer;
  // 转账单建好了：到套餐页付款（手机上会弹出付款窗）
  useEffect(() => {
    if (state?.orderId) {
      announceNewOrder(state.orderId);
      router.push("/plans");
    }
  }, [state, router]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="target" value={username} />
      <input type="hidden" name="useBalance" value={useBalance ? "1" : "0"} />
      {options.map((o) => (
        <label
          key={o.id}
          className={`flex cursor-pointer items-center justify-between gap-3 rounded-box border bg-base-100 p-4 ${o.id === sel ? "border-primary ring-1 ring-primary" : "border-base-content/15"}`}
        >
          <span className="flex items-center gap-3">
            <input type="radio" name="plan" value={o.id} checked={o.id === sel} onChange={() => setSel(o.id)} className="radio radio-primary radio-sm" />
            <span>
              <span className="block font-medium">{o.name}</span>
              <span className="block text-sm text-base-content/60">
                {o.desc} · {o.monthly}
                {t("/月", "/mo")}
              </span>
            </span>
          </span>
          <span className="font-medium tabular-nums">+{money(o.fen)}</span>
        </label>
      ))}
      <div className="mt-2 rounded-box bg-base-200 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-base-content/70">{t(`补差价（剩 ${daysLeft} 天）`, `Difference (${daysLeft} days left)`)}</span>
          <span className="text-2xl font-bold" data-testid="upgrade-price">{money(chosen.fen)}</span>
        </div>
        <p className="mt-1 text-xs text-base-content/50">
          {t(`（${chosen.monthly} − ${currentMonthly}）÷ 30 × ${daysLeft} 天，向上取整到元`, `(${chosen.monthly} − ${currentMonthly}) ÷ 30 × ${daysLeft} days, rounded up`)}
        </p>
        <ul className="mt-3 space-y-1 text-sm text-base-content/70">
          <li>✓ {t("到期时间不变", "Expiry date stays the same")}</li>
          <li>✓ {t("付款后马上生效，不用重新导入，App 里刷新一下订阅", "Takes effect right after payment. No re-import, just refresh the subscription in your app")}</li>
        </ul>
        {balance > 0 && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="checkbox checkbox-sm" checked={useBalance} onChange={(e) => setUseBalance(e.target.checked)} />
            {t(`用余额抵扣（余额 ${money(balance)}）`, `Use balance (${money(balance)} available)`)}
          </label>
        )}
        <button type="submit" className="btn btn-primary mt-4 w-full" disabled={pending || !canPay}>
          {pending
            ? t("处理中…", "Working…")
            : due === 0
              ? t(`用余额付 ${money(chosen.fen)} 升级`, `Pay ${money(chosen.fen)} from balance and upgrade`)
              : deduct > 0
                ? t(`抵扣 ${money(deduct)}，再付 ${money(due)} 升级`, `Use ${money(deduct)} balance, pay ${money(due)} and upgrade`)
                : t(`付 ${money(due)} 升级`, `Pay ${money(due)} to upgrade`)}
        </button>
        {!canPay && <p className="mt-2 text-sm text-base-content/60">{t("余额不够，请联系客服升级", "Not enough balance. Contact support to upgrade")}</p>}
      </div>
      {state?.error && (
        <div role="alert" className="alert alert-error">
          <span>{state.error}</span>
          {state.support && <ContactSupport />}
        </div>
      )}
    </form>
  );
}
