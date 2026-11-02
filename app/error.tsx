"use client";

import Link from "next/link";
import ContactSupport from "./ContactSupport";

// 页面出错（比如 Marzban 暂时连不上）时的兜底：能重试、能找客服，不露出报错细节
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl" aria-hidden>
        ☁️
      </p>
      <h1 className="text-xl font-bold">页面出了点问题</h1>
      <p className="max-w-sm text-base-content/60">一般过几秒重试就好。一直这样的话联系客服，报上下面这串编号。</p>
      {error.digest && <code className="rounded-box bg-base-100 px-3 py-1 text-xs text-base-content/60">{error.digest}</code>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          重试
        </button>
        <Link href="/" className="btn">
          回首页
        </Link>
      </div>
      <ContactSupport className="mt-2 justify-center" />
    </main>
  );
}
