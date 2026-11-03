"use client";

import Link from "next/link";
import ContactSupport from "./ContactSupport";
import { useT } from "./LangContext";

// 页面出错（比如 Marzban 暂时连不上）时的兜底：能重试、能找客服，不露出报错细节
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl" aria-hidden>
        ☁️
      </p>
      <h1 className="text-xl font-bold">{t("页面出了点问题", "Something went wrong")}</h1>
      <p className="max-w-sm text-base-content/60">
        {t("一般过几秒重试就好。一直这样的话联系客服，报上下面这串编号。", "Retrying in a few seconds usually fixes it. If it keeps happening, contact support with the code below.")}
      </p>
      {error.digest && <code className="rounded-box bg-base-100 px-3 py-1 text-xs text-base-content/60">{error.digest}</code>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
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
