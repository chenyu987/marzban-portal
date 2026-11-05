"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Lang } from "@/lib/i18n";
import { setLang } from "./actions";
import { useLang } from "./LangContext";

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: "zh", label: "中文" },
  { lang: "en", label: "English" },
];

// 语言切换：页面底部一个（小），客人和后台的「账户」页各一个（size="sm"）。记一年（登录着的客人也记到账号上，提醒邮件用），
// 换了以后整页按新语言重新渲染
export default function LangSwitch({ size = "xs" }: { size?: "xs" | "sm" }) {
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
    <div className="join" role="group" aria-label="Language">
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          aria-pressed={o.lang === lang}
          disabled={pending}
          className={`btn join-item ${size === "sm" ? "btn-sm" : "btn-xs"} ${o.lang === lang ? "btn-active btn-primary" : "btn-ghost"}`}
          onClick={() => choose(o.lang)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
