"use client";

import { useState, useTransition } from "react";
import type { FormState } from "../../../actions";
import { adminChangePlan } from "../../actions";

type Option = { id: string; name: string; desc: string };

// 订阅现在的套餐，和「改成别的套餐」。改了马上按新套餐改 Marzban 的流量、设备数，到期时间不动；客人订阅页标题跟着变
export default function PlanCard({ username, current, options }: { username: string; current: Option | null; options: Option[] }) {
  const [pick, setPick] = useState(current?.id ?? "");
  const [result, setResult] = useState<FormState>();
  const [pending, start] = useTransition();
  const chosen = options.find((o) => o.id === pick);
  return (
    <div className="mb-4 rounded-box bg-base-100 p-4 shadow-sm" data-testid="plan-card">
      <div className="text-sm text-base-content/60">套餐</div>
      <div className="font-bold">{current ? current.name : "没记套餐（手动建的或老订阅）"}</div>
      {current && <div className="text-sm text-base-content/60">{current.desc}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="换成哪个套餐" className="select select-sm w-56">
          <option value="" disabled>
            选一个套餐
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}（{o.desc}）
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={pending || !chosen || chosen.id === current?.id}
          onClick={() => {
            if (!chosen || !confirm(`把 ${username} 改成「${chosen.name}」？\n流量上限和设备数马上按新套餐改，到期时间不变。`)) return;
            const f = new FormData();
            f.set("username", username);
            f.set("plan", chosen.id);
            start(async () => setResult(await adminChangePlan(undefined, f)));
          }}
        >
          改成这个套餐
        </button>
        {pending && <span className="loading loading-spinner loading-xs" />}
      </div>
      <p className="mt-1 text-xs text-base-content/50">只改流量上限、重置方式和设备数。要加时间用下面的「续期几天」；要收钱让客人自己在网站上下单。</p>
      {result?.error && <div role="alert" className="alert alert-error alert-soft mt-2 text-sm">{result.error}</div>}
      {result?.ok && <div role="alert" className="alert alert-success alert-soft mt-2 text-sm">{result.ok}</div>}
    </div>
  );
}
