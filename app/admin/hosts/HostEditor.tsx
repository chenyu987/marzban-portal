"use client";

import { useState, useTransition } from "react";
import type { ProxyHost } from "@/lib/marzban";
import type { FormState } from "../../actions";
import { adminSaveHosts } from "../actions";
import { useT } from "../../LangContext";
import type { T } from "@/lib/i18n";

const security = (t: T): Record<string, string> => ({ inbound_default: t("跟入站一样", "Same as inbound"), none: t("不加密", "None"), tls: "TLS" });
const blank = (): ProxyHost => ({ remark: "", address: "", port: null, sni: null, host: null, path: null, security: "inbound_default", is_disabled: false });

// 一个入站的 Host 列表：改、加、删、上下挪（订阅里的顺序就是这里的顺序）、停用。改完点保存才生效
export default function HostEditor({ tag, initial }: { tag: string; initial: ProxyHost[] }) {
  const t = useT();
  const [rows, setRows] = useState<ProxyHost[]>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [result, setResult] = useState<FormState>();
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(rows) !== saved;

  const set = (i: number, patch: Partial<ProxyHost>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setRows(next);
  };

  function save() {
    const off = rows.filter((r) => r.is_disabled).length;
    const msg = t(
      `保存 ${tag} 的 ${rows.length} 个 Host${off ? `（其中 ${off} 个停用）` : ""}？客人更新订阅后马上生效`,
      `Save ${rows.length} Host(s) for ${tag}${off ? ` (${off} disabled)` : ""}? Takes effect when customers update their subscription`,
    );
    if (!confirm(msg)) return;
    const form = new FormData();
    form.set("tag", tag);
    form.set("hosts", JSON.stringify(rows));
    setResult(undefined);
    start(async () => {
      const r = await adminSaveHosts(undefined, form);
      setResult(r);
      if (r?.ok) setSaved(JSON.stringify(rows));
    });
  }

  const input = (i: number, k: "remark" | "address" | "sni" | "host" | "path", ph: string, cls = "") => (
    <input value={(rows[i][k] as string | null) ?? ""} onChange={(e) => set(i, { [k]: e.target.value })} placeholder={ph} aria-label={ph} className={`input input-xs w-full ${cls}`} />
  );

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && <p className="text-sm text-base-content/60">{t("这个入站没有 Host，客人订阅里不会出现它。", "This inbound has no Hosts, so it won't appear in subscriptions.")}</p>}
      {rows.map((r, i) => (
        <div key={i} className={`grid gap-1 rounded-box border border-base-300 p-2 sm:grid-cols-12 ${r.is_disabled ? "opacity-50" : ""}`} data-testid="host-row">
          <div className="sm:col-span-4">{input(i, "remark", t("备注（节点名）", "Remark (node name)"))}</div>
          <div className="sm:col-span-3">{input(i, "address", t("地址", "Address"))}</div>
          <input
            value={r.port ?? ""}
            onChange={(e) => set(i, { port: e.target.value === "" ? null : (e.target.value as unknown as number) })}
            placeholder={t("端口（空=入站的）", "Port (empty = inbound's)")}
            aria-label={t("端口", "Port")}
            inputMode="numeric"
            className="input input-xs w-full sm:col-span-2"
          />
          <select value={r.security} onChange={(e) => set(i, { security: e.target.value as ProxyHost["security"] })} aria-label={t("安全", "Security")} className="select select-xs w-full sm:col-span-3">
            {Object.entries(security(t)).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <div className="sm:col-span-4">{input(i, "sni", t("SNI（选填）", "SNI (optional)"))}</div>
          <div className="sm:col-span-4">{input(i, "host", t("Host 头（选填）", "Host header (optional)"))}</div>
          <div className="sm:col-span-4">{input(i, "path", t("路径（选填）", "Path (optional)"))}</div>
          <div className="flex flex-wrap items-center gap-1 sm:col-span-12">
            <label className="label cursor-pointer gap-1 text-xs">
              <input type="checkbox" className="checkbox checkbox-xs" checked={!!r.is_disabled} onChange={(e) => set(i, { is_disabled: e.target.checked })} />
              {t("停用", "Disabled")}
            </label>
            <button type="button" className="btn btn-ghost btn-xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("上移", "Move up")}>
              ↑
            </button>
            <button type="button" className="btn btn-ghost btn-xs" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={t("下移", "Move down")}>
              ↓
            </button>
            <button type="button" className="btn btn-ghost btn-xs text-error" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              {t("删掉这个", "Remove")}
            </button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm" onClick={() => setRows([...rows, blank()])}>
          {t("加一个 Host", "Add a Host")}
        </button>
        <button type="button" className="btn btn-sm btn-primary" disabled={!dirty || pending} onClick={save}>
          {pending && <span className="loading loading-spinner loading-xs" />}
          {t("保存", "Save")}
        </button>
        {dirty && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRows(JSON.parse(saved))}>
            {t("撤销改动", "Discard changes")}
          </button>
        )}
        {dirty && <span className="text-xs text-warning">{t("有没保存的改动", "Unsaved changes")}</span>}
      </div>
      {result?.error && <div role="alert" className="alert alert-error alert-soft text-sm">{result.error}</div>}
      {result?.ok && <div role="alert" className="alert alert-success alert-soft text-sm">{result.ok}</div>}
    </div>
  );
}
