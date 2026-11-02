"use client";

import { useEffect, useState, useTransition } from "react";
import QRCode from "qrcode";
import { adminDeleteUser, adminResetUsage, adminRevokeSub } from "../../actions";

function Alert({ state }: { state?: { error?: string; ok?: string } }) {
  if (state?.error) return <div role="alert" className="alert alert-error alert-soft text-sm">{state.error}</div>;
  if (state?.ok) return <div role="alert" className="alert alert-success alert-soft text-sm">{state.ok}</div>;
  return null;
}

// 订阅链接（复制、二维码）和三个危险操作：清零流量、重置订阅链接、删除。都先弹框确认，删除要把用户名打一遍。
// 三个操作用按钮直接调 Server Action，不包 <form>：刚保存完页面还在刷新时点表单，会变成整页提交，结果提示就丢了
export default function UserActions({ username, url, links }: { username: string; url: string; links: string[] }) {
  const [result, setResult] = useState<{ error?: string; ok?: string } | undefined>();
  const [pending, startTransition] = useTransition();
  const [qr, setQr] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (shown) QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setQr);
  }, [shown, url]);

  function run(action: typeof adminResetUsage, ask: () => boolean) {
    if (!ask()) return;
    const form = new FormData();
    form.set("username", username);
    setResult(undefined);
    startTransition(async () => setResult(await action(undefined, form)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "已复制 ✓" : "复制订阅链接"}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setShown(!shown)}>
          {shown ? "收起二维码" : "显示二维码"}
        </button>
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(adminResetUsage, () => confirm(`把 ${username} 的已用流量清零？`))}>
          流量清零
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => run(adminRevokeSub, () => confirm(`重置 ${username} 的订阅链接？旧链接马上失效，客人所有设备都要重新导入`))}
        >
          重置订阅链接
        </button>
        <button
          type="button"
          className="btn btn-sm btn-error btn-outline"
          disabled={pending}
          onClick={() => run(adminDeleteUser, () => prompt(`删除后客人马上连不上，也不能恢复。确定要删就输入用户名 ${username}`) === username)}
        >
          删除订阅
        </button>
        {pending && <span className="loading loading-spinner loading-sm self-center" />}
      </div>
      <Alert state={result} />
      {links.length > 0 && (
        <details className="text-sm" data-testid="node-links">
          <summary className="cursor-pointer text-base-content/70">每个节点的连接链接（{links.length} 条，客户端不支持订阅时手动导入）</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {links.map((l) => (
              <li key={l} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-base-content/70">{decodeURIComponent(l.split("#")[1] ?? "")}</span>
                <code className="min-w-0 flex-1 truncate text-xs text-base-content/50">{l}</code>
                <button type="button" className="btn btn-xs" onClick={() => navigator.clipboard.writeText(l)}>
                  复制
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {shown && (
        <div className="flex flex-col items-center gap-2 rounded-box bg-base-200 p-4">
          {qr ? <img src={qr} alt="订阅二维码" width={220} height={220} /> : <span className="loading loading-spinner" />}
          <code className="w-full break-all text-center text-xs text-base-content/60">{url}</code>
        </div>
      )}
    </div>
  );
}
