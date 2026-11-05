"use client";

import { useState, useTransition } from "react";
import type { FormState } from "../../actions";
import { adminDeleteExpired, adminPreviewExpired, adminResetAllUsage } from "../actions";
import { useT } from "../../LangContext";

// 用户列表页底的批量操作。删除前必须先「看看有哪些」，确认名单再删；全部清零要打字确认
export default function BulkActions() {
  const [days, setDays] = useState("30");
  const [preview, setPreview] = useState<(FormState & { names?: string[] }) | undefined>();
  const [result, setResult] = useState<FormState>();
  const [pending, start] = useTransition();
  const t = useT();
  const form = () => {
    const f = new FormData();
    f.set("days", days);
    return f;
  };

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3 p-4">
        <h2 className="font-bold">{t("批量操作", "Bulk actions")}</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {t("删除到期超过", "Delete subscriptions expired more than")}
          <input
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setPreview(undefined);
            }}
            inputMode="numeric"
            aria-label={t("天数", "Days")}
            className="input input-xs w-16"
          />
          {t("天的订阅", "days")}
          <button
            type="button"
            className="btn btn-xs"
            disabled={pending}
            onClick={() => {
              setResult(undefined);
              start(async () => setPreview(await adminPreviewExpired(undefined, form())));
            }}
          >
            {t("先看看有哪些", "Preview first")}
          </button>
          {!!preview?.names?.length && (
            <button
              type="button"
              className="btn btn-xs btn-error btn-outline"
              disabled={pending}
              onClick={() => {
                const n = preview.names!.length;
                if (prompt(t(`删除这 ${n} 个订阅？客人就连不上了，也不能恢复。确定就输入数字 ${n}`, `Delete these ${n} subscriptions? Customers lose access and this can't be undone. Type ${n} to confirm`)) !== String(n)) return;
                start(async () => {
                  setResult(await adminDeleteExpired(undefined, form()));
                  setPreview(undefined);
                });
              }}
            >
              {t(`删除这 ${preview.names.length} 个`, `Delete these ${preview.names.length}`)}
            </button>
          )}
        </div>
        {preview?.error && <div className="alert alert-error alert-soft text-sm">{preview.error}</div>}
        {preview?.ok && (
          <div className="text-sm">
            {preview.ok}
            {!!preview.names?.length && <div className="mt-1 text-xs break-all text-base-content/60">{preview.names.join(t("、", ", "))}</div>}
          </div>
        )}
        <div className="divider my-0" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t("所有订阅的已用流量清零（比如每月统一重置）", "Reset used traffic on all subscriptions (e.g. a monthly reset)")}</span>
          <button
            type="button"
            className="btn btn-xs btn-warning btn-outline"
            disabled={pending}
            onClick={() => {
              const word = t("全部清零", "RESET ALL");
              if (prompt(t(`所有订阅的已用流量都会清零，不能撤销。确定就输入：${word}`, `Used traffic on every subscription will be reset. This can't be undone. Type ${word} to confirm`)) !== word) return;
              start(async () => setResult(await adminResetAllUsage()));
            }}
          >
            {t("全部清零", "Reset all")}
          </button>
          {pending && <span className="loading loading-spinner loading-xs" />}
        </div>
        {result?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{result.error}</div>}
        {result?.ok && <div role="alert" className="alert alert-success alert-soft text-sm">{result.ok}</div>}
      </div>
    </div>
  );
}
