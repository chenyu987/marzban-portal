"use client";

import { useState } from "react";
import { useT } from "../LangContext";

// 后台里跟在微信号、邮箱后面的小复制按钮：点一下复制，图标短暂变成 ✓
export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="btn btn-ghost btn-xs btn-square -my-1 text-base-content/50 hover:text-base-content"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // 浏览器不让写剪贴板就算了，还能手动选中
        }
      }}
    >
      {copied ? (
        <span className="text-success">✓</span>
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

// 文字本身就是复制按钮（和客人页的推荐码、订阅编号一样）：鼠标是小手，点一下复制，原来的字短暂换成「已复制 ✓」。
// 「已复制 ✓」叠在原来文字的位置上，列宽不跟着跳。用在后台表格里的微信号、邮箱
export function CopyText({ text, className = "" }: { text: string; className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  async function copy(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 浏览器不让写剪贴板就算了，还能手动选中
    }
  }
  return (
    <span
      role="button"
      tabIndex={0}
      title={t("点击复制", "Click to copy")}
      onClick={copy}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && copy(e)}
      className={`inline-grid cursor-pointer whitespace-nowrap ${className}`}
    >
      <span className={`col-start-1 row-start-1 ${copied ? "invisible" : ""}`}>{text}</span>
      {copied && <span className="col-start-1 row-start-1 text-success">{t("已复制 ✓", "Copied ✓")}</span>}
    </span>
  );
}
