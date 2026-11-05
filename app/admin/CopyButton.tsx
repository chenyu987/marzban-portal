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

// 文字本身就是复制按钮：点一下复制，后面短暂出现 ✓。用在不用跳转的地方（比如订阅列表里的微信号、邮箱）
export function CopyText({ text, className = "" }: { text: string; className?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={t("点一下复制", "Click to copy")}
      className={`cursor-copy text-left whitespace-nowrap hover:underline ${className}`}
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
      {text}
      {copied && <span className="ml-1 text-success">✓</span>}
    </button>
  );
}
