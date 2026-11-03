"use client";

import { usePathname, useRouter } from "next/navigation";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";
import { useLang } from "./LangContext";

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: "zh", label: "中文" },
  { lang: "en", label: "English" },
];

// 页面底部的语言切换。记一年，换了以后整页按新语言重新渲染。管理后台只有中文，不显示
export default function LangSwitch() {
  const lang = useLang();
  const router = useRouter();
  const path = usePathname();
  if (path.startsWith("/admin")) return null;
  function choose(next: Lang) {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }
  return (
    <div className="join" role="group" aria-label="Language">
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          aria-pressed={o.lang === lang}
          className={`btn join-item btn-xs ${o.lang === lang ? "btn-active" : "btn-ghost"}`}
          onClick={() => choose(o.lang)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
