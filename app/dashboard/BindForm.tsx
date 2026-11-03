"use client";

import { useActionState } from "react";
import { bindSubscription } from "../actions";
import ContactSupport from "../ContactSupport";
import { useT } from "../LangContext";

// compact：已经有订阅时只在页面最下面放一个小链接，点开才出输入框
export default function BindForm({ compact = false }: { compact?: boolean }) {
  const [state, action, pending] = useActionState(bindSubscription, undefined);
  const t = useT();
  const form = (
    <form action={action} className="flex flex-col gap-3">
      <div className="join w-full">
        <input
          name="link"
          required
          placeholder="https://.../sub/..."
          autoComplete="off"
          className="input join-item w-full"
        />
        <button className="btn btn-primary join-item" disabled={pending}>
          {pending && <span className="loading loading-spinner loading-sm" />}
          {t("绑定", "Link")}
        </button>
      </div>
      {state?.error && <div role="alert" className="alert alert-error alert-soft">{state.error}</div>}
      {state?.support && <ContactSupport />}
      {state?.ok && <div role="alert" className="alert alert-success alert-soft">{state.ok}</div>}
    </form>
  );

  if (compact) {
    return (
      <details className="mt-8 text-sm text-base-content/60">
        <summary className="cursor-pointer select-none">{t("还有别的订阅链接？绑定到这个账号", "Have another subscription link? Link it to this account")}</summary>
        <div className="mt-3">{form}</div>
      </details>
    );
  }

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">{t("绑定已有订阅", "Link an existing subscription")}</h2>
        <p className="text-sm text-base-content/70">
          {t("把管理员发给你的订阅链接粘贴进来，就能在这里看到到期时间和流量。", "Paste the subscription link support sent you to see its expiry date and data usage here.")}
        </p>
        {form}
      </div>
    </div>
  );
}
