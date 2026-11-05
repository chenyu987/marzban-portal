"use client";

import { useState } from "react";
import type { FormState } from "../../../actions";
import { adminChangePlan } from "../../actions";
import { useT } from "../../../LangContext";

type Option = { id: string; name: string; desc: string };

// 订阅现在的套餐，和「改成别的套餐」。改了马上按新套餐改 Marzban 的流量、设备数，到期时间不动；客人订阅页标题跟着变。
// 转圈和「现在的套餐」只看服务器返回，不等整页刷新：线上整页刷新有时一直不结束，按钮旁边就一直转、上面还写着旧套餐
export default function PlanCard({ username, current: fromServer, options }: { username: string; current: Option | null; options: Option[] }) {
  const t = useT();
  const [pick, setPick] = useState(fromServer?.id ?? "");
  const [result, setResult] = useState<FormState>();
  const [pending, setPending] = useState(false);
  const [changed, setChanged] = useState<Option | null>(null);
  const current = changed ?? fromServer;
  const chosen = options.find((o) => o.id === pick);
  return (
    <div className="mb-4 rounded-box bg-base-100 p-4 shadow-sm" data-testid="plan-card">
      <div className="text-sm text-base-content/60">{t("套餐", "Plan")}</div>
      <div className="font-bold">{current ? current.name : t("没记套餐（手动建的或老订阅）", "No plan recorded (created manually or legacy)")}</div>
      {current && <div className="text-sm text-base-content/60">{current.desc}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t("换成哪个套餐", "Change to plan")} className="select select-sm w-56">
          <option value="" disabled>
            {t("选一个套餐", "Choose a plan")}
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {t(`${o.name}（${o.desc}）`, `${o.name} (${o.desc})`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={pending || !chosen || chosen.id === current?.id}
          onClick={() => {
            if (!chosen || !confirm(t(`把 ${username} 改成「${chosen.name}」？\n流量上限和设备数马上按新套餐改，到期时间不变。`, `Switch ${username} to “${chosen.name}”?\nData limit and device count change right away; expiry stays the same.`))) return;
            const f = new FormData();
            f.set("username", username);
            f.set("plan", chosen.id);
            setPending(true);
            adminChangePlan(undefined, f)
              .then((r) => {
                setResult(r);
                if (r?.ok) setChanged(chosen);
              })
              .catch(() => setResult({ error: t("没连上服务器，刷新页面看看改没改成", "Couldn't reach the server; refresh to see whether it changed") }))
              .finally(() => setPending(false));
          }}
        >
          {t("改成这个套餐", "Switch to this plan")}
        </button>
        {pending && <span className="loading loading-spinner loading-xs" />}
      </div>
      <p className="mt-1 text-xs text-base-content/50">
        {t(
          "只改流量上限、重置方式和设备数。要加时间用下面的「续期几天」；要收钱让客人自己在网站上下单。",
          "Changes only the data limit, reset and device count. To add time use “Add days” below; to charge, let the customer order on the site.",
        )}
      </p>
      {result?.error && <div role="alert" className="alert alert-error alert-soft mt-2 text-sm">{result.error}</div>}
      {result?.ok && <div role="alert" className="alert alert-success alert-soft mt-2 text-sm">{result.ok}</div>}
    </div>
  );
}
