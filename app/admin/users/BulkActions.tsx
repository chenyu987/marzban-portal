"use client";

import { useState, useTransition } from "react";
import type { FormState } from "../../actions";
import { adminDeleteExpired, adminPreviewExpired, adminResetAllUsage } from "../actions";

// 用户列表页底的批量操作。删除前必须先「看看有哪些」，确认名单再删；全部清零要打字确认
export default function BulkActions() {
  const [days, setDays] = useState("30");
  const [preview, setPreview] = useState<(FormState & { names?: string[] }) | undefined>();
  const [result, setResult] = useState<FormState>();
  const [pending, start] = useTransition();
  const form = () => {
    const f = new FormData();
    f.set("days", days);
    return f;
  };

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3 p-4">
        <h2 className="font-bold">批量操作</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          删除到期超过
          <input
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setPreview(undefined);
            }}
            inputMode="numeric"
            aria-label="天数"
            className="input input-xs w-16"
          />
          天的用户
          <button
            type="button"
            className="btn btn-xs"
            disabled={pending}
            onClick={() => {
              setResult(undefined);
              start(async () => setPreview(await adminPreviewExpired(undefined, form())));
            }}
          >
            先看看有哪些
          </button>
          {!!preview?.names?.length && (
            <button
              type="button"
              className="btn btn-xs btn-error btn-outline"
              disabled={pending}
              onClick={() => {
                const n = preview.names!.length;
                if (prompt(`删除这 ${n} 个用户？客人就连不上了，也不能恢复。确定就输入数字 ${n}`) !== String(n)) return;
                start(async () => {
                  setResult(await adminDeleteExpired(undefined, form()));
                  setPreview(undefined);
                });
              }}
            >
              删除这 {preview.names.length} 个
            </button>
          )}
        </div>
        {preview?.error && <div className="alert alert-error alert-soft text-sm">{preview.error}</div>}
        {preview?.ok && (
          <div className="text-sm">
            {preview.ok}
            {!!preview.names?.length && <div className="mt-1 text-xs break-all text-base-content/60">{preview.names.join("、")}</div>}
          </div>
        )}
        <div className="divider my-0" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>所有用户的已用流量清零（比如每月统一重置）</span>
          <button
            type="button"
            className="btn btn-xs btn-warning btn-outline"
            disabled={pending}
            onClick={() => {
              if (prompt("所有用户的已用流量都会清零，不能撤销。确定就输入：全部清零") !== "全部清零") return;
              start(async () => setResult(await adminResetAllUsage()));
            }}
          >
            全部清零
          </button>
          {pending && <span className="loading loading-spinner loading-xs" />}
        </div>
        {result?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{result.error}</div>}
        {result?.ok && <div role="alert" className="alert alert-success alert-soft text-sm">{result.ok}</div>}
      </div>
    </div>
  );
}
