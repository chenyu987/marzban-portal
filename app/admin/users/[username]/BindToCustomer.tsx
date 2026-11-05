"use client";

import { useState, useTransition } from "react";
import type { FormState } from "../../../actions";
import { adminBindUser, adminSetSubWechat } from "../../actions";
import { useT } from "../../../LangContext";

// 订阅还没绑客人：填客人的邮箱或微信号，直接在这里绑，不用跑去客人页。
// 还没有这个微信号的客人时，可以先把微信号记在订阅上，客人以后用它注册会自动绑过来
export default function BindToCustomer({ username, wechat }: { username: string; wechat?: string | null }) {
  const t = useT();
  const [who, setWho] = useState("");
  const [result, setResult] = useState<FormState>();
  const [pending, start] = useTransition();
  const call = (fn: typeof adminBindUser, key: string, value: string) => {
    const f = new FormData();
    f.set("username", username);
    f.set(key, value);
    start(async () => setResult(await fn(undefined, f)));
  };
  // 绑定时找不到客人，服务器把填的微信号带回来，这时才给「记下微信号」
  const canRecord = result?.wechat && result.wechat === who.trim();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        value={who}
        onChange={(e) => setWho(e.target.value)}
        placeholder={t("客人的邮箱或微信号", "Customer email or WeChat ID")}
        aria-label={t("绑到客人", "Link to customer")}
        className="input input-sm w-64"
      />
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending || !who.trim()}
        onClick={() => {
          if (!confirm(t(`把订阅 ${username} 绑到 ${who} 名下？`, `Link subscription ${username} to ${who}?`))) return;
          call(adminBindUser, "who", who);
        }}
      >
        {t("绑到这个客人", "Link to this customer")}
      </button>
      {canRecord && (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={pending}
          onClick={() => {
            const w = who.trim();
            if (!confirm(
                wechat
                  ? t(`把订阅 ${username} 的微信号从 ${wechat} 改成 ${w}？`, `Change the WeChat ID on ${username} from ${wechat} to ${w}?`)
                  : t(`给订阅 ${username} 记下微信号 ${w}？`, `Record WeChat ID ${w} on ${username}?`),
              )) return;
            call(adminSetSubWechat, "wechat", w);
          }}
        >
          {wechat ? t("改成这个微信号", "Change to this WeChat ID") : t("记下这个微信号", "Record this WeChat ID")}
        </button>
      )}
      {result?.error && <span className="basis-full text-sm text-error">{result.error}</span>}
      {result?.ok && <span className="basis-full text-sm text-success">{result.ok}</span>}
    </div>
  );
}
