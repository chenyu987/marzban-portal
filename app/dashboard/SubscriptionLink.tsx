"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { clashVergeImport, hiddifyImport, shadowrocketImport, shadowrocketQr, type ImportApp } from "@/lib/clients";
import { useSite } from "../SiteContext";
import { resetSubscriptionLink } from "../actions";
import { confirmSubmit } from "../ConfirmDialog";
import { useT } from "../LangContext";

const IMPORTS: { id: ImportApp; app: string; href: (url: string, name: string) => string }[] = [
  { id: "shadowrocket", app: "Shadowrocket", href: shadowrocketImport },
  { id: "clash", app: "Clash Verge", href: clashVergeImport },
  { id: "hiddify", app: "Hiddify", href: hiddifyImport },
];

// 订阅链接等于密码：默认收起，二维码在浏览器里本地生成，不交给任何第三方服务
// primary：大按钮给哪个 App，服务器按客人的设备选好（primaryApp）；别的 App 放在「其他方式」里
export default function SubscriptionLink({ username, url, primary }: { username: string; url: string; primary: ImportApp }) {
  const { importName } = useSite();
  const t = useT();
  const [shown, setShown] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  // 两个 App 认的二维码格式不一样（2026-11-03 真机试过，没有两边通用的），默认给 Shadowrocket；
  // Hiddify 扫的是和导入按钮一样的 hiddify:// 链接。都带名字，扫进去不显示域名
  const [forShadowrocket, setForShadowrocket] = useState(true);
  const [copied, setCopied] = useState(false);
  const main = IMPORTS.find((c) => c.id === primary) ?? IMPORTS[0];
  // 点过大按钮就在下面提示「没打开 App？」：没装 App 时点了什么反应都没有，网页也没法可靠地知道 App 打没打开，所以点过就一直显示
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (shown)
      QRCode.toDataURL(forShadowrocket ? shadowrocketQr(url, importName) : hiddifyImport(url, importName), { width: 240, margin: 1 }).then(setQr);
  }, [shown, url, forShadowrocket, importName]);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3 border-t border-base-content/10 pt-4">
      {/* 只突出一个按钮：这台设备该用的 App 一键导入。别的方式降成下面一排小按钮，免得六个按钮一样大、不知道点哪个 */}
      <a href={main.href(url, importName)} onClick={() => setTried(true)} className="btn btn-primary w-full" data-testid="main-import">
        {t(`一键导入 ${main.app}`, `Import to ${main.app}`)}
      </a>
      {tried && (
        <p className="-mt-1 text-center text-sm text-base-content/60" data-testid="import-hint">
          {t(`没打开 App？可能还没装 ${main.app}，`, `Nothing happened? You may not have ${main.app} yet. `)}
          <Link href="/tutorial" className="link link-primary">
            {t("先看安装教程装好", "Install it from the setup guide")}
          </Link>
          {t("再点", ", then tap again")}
        </p>
      )}
      {/* -ml-2 抵掉小按钮的左内边距，「其他方式」也加同样的内边距：折行后每行都和卡片左边对齐 */}
      <div className="-ml-2 flex flex-wrap items-center gap-1 text-sm">
        <span className="px-2 text-base-content/50">{t("其他方式", "Other ways")}</span>
        <button type="button" onClick={copy} className="btn btn-ghost btn-sm px-2 font-normal">
          {copied ? t("已复制 ✓", "Copied ✓") : t("复制订阅链接", "Copy subscription link")}
        </button>
        <button type="button" onClick={() => setShown(!shown)} className="btn btn-ghost btn-sm px-2 font-normal">
          {shown ? t("收起二维码", "Hide QR code") : t("显示二维码", "Show QR code")}
        </button>
        {IMPORTS.filter((c) => c !== main).map((c) => (
          <a key={c.id} href={c.href(url, importName)} className="btn btn-ghost btn-sm px-2 font-normal">
            {t(`导入 ${c.app}`, `Import to ${c.app}`)}
          </a>
        ))}
        {/* 给要手动导入文件的 Clash 客户端用，已经带好分流规则 */}
        <a href={`/dashboard/clash/${encodeURIComponent(username)}`} download className="btn btn-ghost btn-sm px-2 font-normal">
          {t("下载 Clash 配置文件", "Download Clash config")}
        </a>
      </div>

      {shown && (
        <div className="flex flex-col items-center gap-2 rounded-box bg-base-200 p-4">
          <div role="tablist" className="tabs tabs-box tabs-sm">
            <button type="button" role="tab" className={`tab ${forShadowrocket ? "tab-active" : ""}`} onClick={() => setForShadowrocket(true)}>
              Shadowrocket
            </button>
            <button type="button" role="tab" className={`tab ${forShadowrocket ? "" : "tab-active"}`} onClick={() => setForShadowrocket(false)}>
              Hiddify
            </button>
          </div>
          {qr ? <img src={qr} alt={t("订阅二维码", "Subscription QR code")} width={240} height={240} /> : <span className="loading loading-spinner" />}
          <p className="text-center text-xs text-base-content/60">
            {t("用客户端扫码导入。不要截图发给别人：别人拿到就能用你的流量", "Scan it with your app to import. Don't share screenshots: anyone who has it can use your data")}
          </p>
          <code className="w-full break-all text-center text-xs text-base-content/60">{url}</code>
        </div>
      )}

    </div>
  );
}

// 「链接泄露了？重置订阅链接」，放在卡片最底下一行左边，和订阅编号对齐
export function ResetLinkButton({ username }: { username: string }) {
  const t = useT();
  return (
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
  );
}
