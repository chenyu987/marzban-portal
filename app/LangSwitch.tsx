"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Lang } from "@/lib/i18n";
import { setLang } from "./actions";
import { useLang } from "./LangContext";

const OPTIONS: { lang: Lang; label: string; short: string }[] = [
  { lang: "zh", label: "中文", short: "中" },
  { lang: "en", label: "English", short: "EN" },
];

// 语言切换：页面底部一个（小），客人和后台的「账户」页各一个（size="sm"）。记一年（登录着的客人也记到账号上，提醒邮件用），
// 换了以后整页按新语言重新渲染。compact：登录、注册卡片右下角那个，只写「中 / EN」
export default function LangSwitch({ size = "xs", compact }: { size?: "xs" | "sm"; compact?: boolean }) {
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  function choose(next: Lang) {
    start(async () => {
      await setLang(next);
      router.refresh();
    });
  }
  return (
    <div className={`join ${compact ? "rounded-full" : ""}`} role="group" aria-label="Language">
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          aria-pressed={o.lang === lang}
          disabled={pending}
          className={`btn join-item ${size === "sm" ? "btn-sm" : "btn-xs"} ${o.lang === lang ? "btn-active btn-primary" : "btn-ghost"}`}
          onClick={() => choose(o.lang)}
          aria-label={o.label}
        >
          {compact ? o.short : o.label}
        </button>
      ))}
    </div>
  );
}
