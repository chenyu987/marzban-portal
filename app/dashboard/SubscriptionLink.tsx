"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { clashVergeImport, hiddifyImport, shadowrocketImport } from "@/lib/clients";
import { resetSubscriptionLink } from "../actions";

// 大部分客人用 iPhone，Shadowrocket 固定放导入按钮的第一个
const IMPORTS: { id: string; label: string; href: (url: string) => string }[] = [
  { id: "shadowrocket", label: "导入 Shadowrocket", href: shadowrocketImport },
  { id: "clash", label: "导入 Clash Verge", href: clashVergeImport },
  { id: "hiddify", label: "导入 Hiddify", href: hiddifyImport },
];

// 订阅链接等于密码：默认收起，二维码在浏览器里本地生成，不交给任何第三方服务
export default function SubscriptionLink({ username, url }: { username: string; url: string }) {
  const [shown, setShown] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (shown) QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setQr);
  }, [shown, url]);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {/* 复制链接和二维码哪个客户端都能用，放最前面；复制链接是主按钮 */}
        <button type="button" onClick={copy} className="btn btn-sm btn-primary">
          {copied ? "已复制 ✓" : "复制订阅链接"}
        </button>
        <button type="button" onClick={() => setShown(!shown)} className="btn btn-sm">
          {shown ? "收起二维码" : "显示二维码"}
        </button>
        {IMPORTS.map((c) => (
          <a key={c.label} href={c.href(url)} className="btn btn-sm">
            {c.label}
          </a>
        ))}
      </div>

      {shown && (
        <div className="flex flex-col items-center gap-2 rounded-box bg-base-200 p-4">
          {qr ? <img src={qr} alt="订阅二维码" width={240} height={240} /> : <span className="loading loading-spinner" />}
          <p className="text-center text-xs text-base-content/60">用客户端扫码导入。不要截图发给别人：别人拿到就能用你的流量</p>
          <code className="w-full break-all text-center text-xs text-base-content/60">{url}</code>
        </div>
      )}

      <form
        action={resetSubscriptionLink}
        onSubmit={(e) => {
          if (!confirm("重置后旧链接立刻失效，所有设备都要重新导入。确定吗？")) e.preventDefault();
        }}
      >
        <input type="hidden" name="username" value={username} />
        <button className="btn btn-ghost btn-xs text-base-content/60">链接泄露了？重置订阅链接</button>
      </form>
    </div>
  );
}
