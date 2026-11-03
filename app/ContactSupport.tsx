"use client";

import { useState } from "react";
import { useSite } from "./SiteContext";

// 「复制客服微信」「复制客服邮箱」按钮。页面底部一直有；提示里说「请联系客服」的地方也放一组，客人不用另找
export default function ContactSupport({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState<"wechat" | "email" | null>(null);
  const SUPPORT = useSite().support;
  if (!SUPPORT.wechat && !SUPPORT.email) return null;

  async function copy(what: "wechat" | "email", text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${className}`}>
      <span className="text-base-content/60">联系客服：</span>
      {SUPPORT.wechat && (
        <button type="button" className="btn btn-xs" onClick={() => copy("wechat", SUPPORT.wechat!)}>
          {copied === "wechat" ? "已复制 ✓" : `复制客服微信 ${SUPPORT.wechat}`}
        </button>
      )}
      {SUPPORT.email && (
        <button type="button" className="btn btn-xs" onClick={() => copy("email", SUPPORT.email!)}>
          {copied === "email" ? "已复制 ✓" : `复制客服邮箱 ${SUPPORT.email}`}
        </button>
      )}
    </div>
  );
}
