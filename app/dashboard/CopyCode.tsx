"use client";

import { useState } from "react";
import { useT } from "../LangContext";

// 点一下就复制的文字（订阅编号）。样式不变，只是鼠标变手形；复制后那几个字短暂换成「已复制 ✓」
export default function CopyCode({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 浏览器不让写剪贴板就算了，客人还能手动选中
    }
  }
  return (
    <span
      role="button"
      tabIndex={0}
      title={t("点击复制", "Click to copy")}
      onClick={copy}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), copy())}
      className="cursor-pointer"
      data-testid="sub-id"
      data-code={text}
    >
      {copied ? t("已复制 ✓", "Copied ✓") : text}
    </span>
  );
}
