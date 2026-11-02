"use client";

import { useState, useTransition } from "react";
import type { FormState } from "../actions";
import { adminBindSubscription } from "./actions";

// 一键把订阅绑到客人名下（老订阅和注册客人微信号一样时用）。微信号别人也能填，所以要管理员确认，不自动绑
export default function BindButton({ customerId, username, who }: { customerId: number; username: string; who: string }) {
  const [result, setResult] = useState<FormState>();
  const [pending, start] = useTransition();
  if (result?.ok) return <span className="text-sm text-success">已绑定 ✓</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn btn-xs btn-primary"
        disabled={pending}
        onClick={() => {
          if (!confirm(`把订阅 ${username} 绑到客人 ${who} 名下？绑了之后客人登录就能看到、能续费`)) return;
          const f = new FormData();
          f.set("customerId", String(customerId));
          f.set("username", username);
          start(async () => setResult(await adminBindSubscription(undefined, f)));
        }}
      >
        绑定
      </button>
      {result?.error && <span className="text-xs text-error">{result.error}</span>}
    </span>
  );
}
