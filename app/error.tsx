"use client";

import Link from "next/link";
import { useEffect } from "react";
import ContactSupport from "./ContactSupport";
import { useT } from "./LangContext";
import { isStaleDeployError } from "@/lib/stale";

const RELOADED_AT = "stale-reload-at";

// 页面出错（比如 Marzban 暂时连不上）时的兜底：能重试、能找客服，不露出报错细节。
// 网站刚更新、页面还是旧版本时（点按钮报「Server Action 找不到」之类）自动整页刷新一次；一分钟内不重复刷，免得来回转圈
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  const stale = isStaleDeployError(error);
  useEffect(() => {
    if (!stale) return;
    try {
      const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    } catch {
      // 存不了（隐私模式之类）也照样刷新一次
    }
    window.location.reload();
  }, [stale]);
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl" aria-hidden>
        ☁️
      </p>
      <h1 className="text-xl font-bold">{t("页面出了点问题", "Something went wrong")}</h1>
      <p className="max-w-sm text-base-content/60">
        {stale
          ? t("网站刚更新过，刷新一下页面就好。", "The site was just updated. Reload the page to continue.")
          : t("一般过几秒重试就好。一直这样的话联系客服，报上下面这串编号。", "Retrying in a few seconds usually fixes it. If it keeps happening, contact support with the code below.")}
      </p>
      {error.digest && <code className="rounded-box bg-base-100 px-3 py-1 text-xs text-base-content/60">{error.digest}</code>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => (stale ? window.location.reload() : reset())}>
          {t("重试", "Retry")}
        </button>
        <Link href="/" className="btn">
          {t("回首页", "Home")}
        </Link>
      </div>
      <ContactSupport className="mt-2 justify-center" />
    </main>
  );
}
