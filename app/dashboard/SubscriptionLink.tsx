"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { clashVergeImport, hiddifyImport, shadowrocketImport } from "@/lib/clients";
import { useSite } from "../SiteContext";
import { resetSubscriptionLink } from "../actions";
import { confirmSubmit } from "../ConfirmDialog";
import { useT } from "../LangContext";

// 大部分客人用 iPhone，Shadowrocket 固定放导入按钮的第一个
const IMPORTS: { id: string; app: string; href: (url: string, name: string) => string }[] = [
  { id: "shadowrocket", app: "Shadowrocket", href: shadowrocketImport },
  { id: "clash", app: "Clash Verge", href: clashVergeImport },
  { id: "hiddify", app: "Hiddify", href: hiddifyImport },
];

// 订阅链接等于密码：默认收起，二维码在浏览器里本地生成，不交给任何第三方服务
export default function SubscriptionLink({ username, url }: { username: string; url: string }) {
  const { importName } = useSite();
  const t = useT();
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
      {/* 第一行：哪个客户端都能用的（复制链接是主按钮）；第二行：各客户端的一键导入 */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn btn-sm btn-primary">
          {copied ? t("已复制 ✓", "Copied ✓") : t("复制订阅链接", "Copy subscription link")}
        </button>
        <button type="button" onClick={() => setShown(!shown)} className="btn btn-sm">
          {shown ? t("收起二维码", "Hide QR code") : t("显示二维码", "Show QR code")}
        </button>
        {/* 给要手动导入文件的 Clash 客户端用，已经带好分流规则 */}
        <a href={`/dashboard/clash/${encodeURIComponent(username)}`} download className="btn btn-sm">
          {t("下载 Clash 配置文件", "Download Clash config")}
        </a>
      </div>
      <div className="flex flex-wrap gap-2">
        {IMPORTS.map((c) => (
          <a key={c.id} href={c.href(url, importName)} className="btn btn-sm">
            {t(`导入 ${c.app}`, `Import to ${c.app}`)}
          </a>
        ))}
      </div>
      <p className="text-xs text-base-content/60">
        {t(
          "Clash 配置文件已经带好分流规则，适合 FlClash、ClashX 这类要手动导入文件的客户端。文件不会自动更新，节点有变化要重新下载；能一键导入的客户端优先用导入。",
          "The Clash config file already includes routing rules, for Clash apps that import a file (FlClash, ClashX). It won't update itself, so download it again when servers change; if your app supports one-tap import, use that instead.",
        )}
      </p>

      {shown && (
        <div className="flex flex-col items-center gap-2 rounded-box bg-base-200 p-4">
          {qr ? <img src={qr} alt={t("订阅二维码", "Subscription QR code")} width={240} height={240} /> : <span className="loading loading-spinner" />}
          <p className="text-center text-xs text-base-content/60">
            {t("用客户端扫码导入。不要截图发给别人：别人拿到就能用你的流量", "Scan it with your app to import. Don't share screenshots: anyone who has it can use your data")}
          </p>
          <code className="w-full break-all text-center text-xs text-base-content/60">{url}</code>
        </div>
      )}

      <form
        action={resetSubscriptionLink}
        onSubmit={(e) => {
          confirmSubmit(e, t("重置后旧链接立刻失效，所有设备都要重新导入。确定吗？", "The old link stops working immediately and every device must import again. Continue?"), {
            ok: t("重置", "Reset"),
            danger: true,
          });
        }}
      >
        <input type="hidden" name="username" value={username} />
        <button className="btn btn-ghost btn-xs text-base-content/60">{t("链接泄露了？重置订阅链接", "Link leaked? Reset subscription link")}</button>
      </form>
    </div>
  );
}
