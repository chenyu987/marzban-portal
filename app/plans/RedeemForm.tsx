"use client";

import { useActionState } from "react";
import { redeem } from "../actions";
import ContactSupport from "../ContactSupport";
import { useT } from "../LangContext";

export default function RedeemForm({
  note,
  subscriptions,
  defaultTarget,
}: {
  note: string;
  subscriptions: { username: string; label: string }[];
  defaultTarget?: string;
}) {
  const [state, action, pending] = useActionState(redeem, undefined);
  const t = useT();
  return (
    <form action={action} className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">{t("输入兑换码", "Redeem a code")}</h2>
        <p className="text-sm text-base-content/70">{note}</p>
        <input
          name="code"
          required
          placeholder="XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          className="input w-full font-mono uppercase"
        />
        {subscriptions.length > 0 && (
          <select name="target" className="select w-full" defaultValue={defaultTarget ?? subscriptions[0].username}>
            {subscriptions.map((s) => (
              <option key={s.username} value={s.username}>
                {t(`给订阅 ${s.label} 续期`, `Renew subscription ${s.label}`)}
              </option>
            ))}
            <option value="new">{t("新开一个订阅", "New subscription")}</option>
          </select>
        )}
        <button className="btn btn-primary" disabled={pending}>
          {pending && <span className="loading loading-spinner loading-sm" />}
          {t("兑换", "Redeem")}
        </button>
        {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
      {state?.support && <ContactSupport />}
        {state?.ok && <div role="alert" className="alert alert-success alert-soft">{state.ok}</div>}
      </div>
    </form>
  );
}
