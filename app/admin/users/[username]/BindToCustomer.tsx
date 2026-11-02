"use client";

import { useState, useTransition } from "react";
import type { FormState } from "../../../actions";
import { adminBindUser } from "../../actions";

// 订阅还没绑客人：填客人的邮箱或微信号，直接在这里绑，不用跑去客人页
export default function BindToCustomer({ username }: { username: string }) {
  const [who, setWho] = useState("");
  const [result, setResult] = useState<FormState>();
  const [pending, start] = useTransition();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="客人的邮箱或微信号" aria-label="绑到客人" className="input input-sm w-64" />
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending || !who.trim()}
        onClick={() => {
          if (!confirm(`把订阅 ${username} 绑到 ${who} 名下？`)) return;
          const f = new FormData();
          f.set("username", username);
          f.set("who", who);
          start(async () => setResult(await adminBindUser(undefined, f)));
        }}
      >
        绑到这个客人
      </button>
      {result?.error && <span className="text-sm text-error">{result.error}</span>}
      {result?.ok && <span className="text-sm text-success">{result.ok}</span>}
    </div>
  );
}
