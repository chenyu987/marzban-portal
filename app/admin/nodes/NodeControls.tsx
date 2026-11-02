"use client";

import { useState, useTransition } from "react";
import type { MarzbanNode } from "@/lib/marzban";
import type { FormState } from "../../actions";
import { adminAddNode, adminDeleteNode, adminEditNode, adminReconnectNode, adminRestartCore, adminToggleNode } from "../actions";

function Alert({ state }: { state?: FormState }) {
  if (state?.error) return <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>;
  if (state?.ok) return <div role="alert" className="alert alert-success alert-soft text-sm">{state.ok}</div>;
  return null;
}

// 都用按钮直接调 Server Action（不包 <form>），先弹框确认
function useRun() {
  const [result, setResult] = useState<FormState>();
  const [pending, start] = useTransition();
  const run = (action: (s: FormState, f: FormData) => Promise<FormState>, data: Record<string, string>, ask: () => boolean) => {
    if (!ask()) return;
    const form = new FormData();
    for (const [k, v] of Object.entries(data)) form.set(k, v);
    setResult(undefined);
    start(async () => setResult(await action(undefined, form)));
  };
  return { result, pending, run };
}

function Fields({ node }: { node?: MarzbanNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-5">
      <input name="name" required defaultValue={node?.name} placeholder="节点名，比如 东京" className="input input-sm w-full" />
      <input name="address" required defaultValue={node?.address} placeholder="IP 或域名" className="input input-sm w-full" />
      <input name="port" defaultValue={node?.port ?? 62050} inputMode="numeric" title="服务端口" className="input input-sm w-full" />
      <input name="apiPort" defaultValue={node?.api_port ?? 62051} inputMode="numeric" title="API 端口" className="input input-sm w-full" />
      <input name="coefficient" defaultValue={node?.usage_coefficient ?? 1} inputMode="decimal" title="流量倍率" className="input input-sm w-full" />
    </div>
  );
}

function collect(el: HTMLElement | null): Record<string, string> {
  const out: Record<string, string> = {};
  el?.querySelectorAll("input").forEach((i) => (out[i.name] = i.value));
  return out;
}

export function NodeForm() {
  const { result, pending, run } = useRun();
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setBox} className="card bg-base-100 shadow-sm">
      <div className="card-body gap-2 p-4">
        <p className="text-xs text-base-content/60">名字｜地址｜服务端口｜API 端口｜流量倍率</p>
        <Fields />
        <button
          type="button"
          className="btn btn-primary btn-sm self-start"
          disabled={pending}
          onClick={() => {
            const d = collect(box);
            run(adminAddNode, d, () => confirm(`在 Marzban 上加节点 ${d.name}（${d.address}）？`));
          }}
        >
          加节点
        </button>
        <Alert state={result} />
      </div>
    </div>
  );
}

export function NodeActions({ node }: { node: MarzbanNode }) {
  const { result, pending, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const id = String(node.id);
  const disabled = node.status === "disabled";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-xs" disabled={pending || disabled} onClick={() => run(adminReconnectNode, { id }, () => true)}>
          重连
        </button>
        <button
          type="button"
          className="btn btn-xs"
          disabled={pending}
          onClick={() =>
            run(adminToggleNode, { id, enable: disabled ? "1" : "" }, () =>
              confirm(disabled ? `启用节点 ${node.name}？` : `停用节点 ${node.name}？连在这个节点上的客人会断开，要换别的节点`),
            )
          }
        >
          {disabled ? "启用" : "停用"}
        </button>
        <button type="button" className="btn btn-xs" onClick={() => setEditing(!editing)}>
          {editing ? "收起" : "修改"}
        </button>
        <button
          type="button"
          className="btn btn-xs btn-error btn-outline"
          disabled={pending}
          onClick={() => run(adminDeleteNode, { id }, () => prompt(`删除节点后客人就连不上它了。确定要删就输入节点名 ${node.name}`) === node.name)}
        >
          删除
        </button>
        {pending && <span className="loading loading-spinner loading-xs self-center" />}
      </div>
      {editing && (
        <div ref={setBox} className="flex flex-col gap-2">
          <Fields node={node} />
          <button
            type="button"
            className="btn btn-sm self-start"
            disabled={pending}
            onClick={() => run(adminEditNode, { id, ...collect(box) }, () => confirm(`保存对节点 ${node.name} 的修改？`))}
          >
            保存
          </button>
        </div>
      )}
      <Alert state={result} />
    </div>
  );
}

export function CoreActions() {
  const { result, pending, run } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn btn-sm btn-warning btn-outline self-start"
        disabled={pending}
        onClick={() => run(adminRestartCore, {}, () => confirm("重启 Xray？所有节点都会跟着重启，所有客人断开几秒后自动重连"))}
      >
        重启 Xray
      </button>
      <Alert state={result} />
    </div>
  );
}
