"use client";

import { useState } from "react";
import { CLASH_RULES } from "@/lib/clients";
import { useT } from "../LangContext";

export default function CopyRules() {
  const [copied, setCopied] = useState(false);
  const t = useT();
  async function copy() {
    await navigator.clipboard.writeText(CLASH_RULES);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={copy} className="btn btn-primary btn-sm self-start">
        {copied ? t("已复制 ✓", "Copied ✓") : t("复制规则", "Copy rules")}
      </button>
      <pre className="overflow-x-auto rounded-box bg-base-200 p-3 text-xs">{CLASH_RULES}</pre>
    </div>
  );
}
