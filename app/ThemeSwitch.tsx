"use client";

import { useState } from "react";
import { THEME_COOKIE, themeAttr, type Theme } from "@/lib/theme";
import { useLang } from "./LangContext";

// 「账户」页的深浅色切换：跟随系统 / 浅色 / 深色。记一年，马上生效，不用刷新
export default function ThemeSwitch({ current }: { current: Theme }) {
  const lang = useLang();
  const [theme, setTheme] = useState(current);
  const options: { theme: Theme; label: string }[] = [
    { theme: "system", label: lang === "en" ? "System" : "跟随系统" },
    { theme: "light", label: lang === "en" ? "Light" : "浅色" },
    { theme: "dark", label: lang === "en" ? "Dark" : "深色" },
  ];
  function choose(next: Theme) {
    setTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${365 * 86400}; samesite=lax`;
    const attr = themeAttr(next);
    if (attr) document.documentElement.dataset.theme = attr;
    else delete document.documentElement.dataset.theme;
  }
  return (
    <div className="join" role="group" aria-label="Theme">
      {options.map((o) => (
        <button
          key={o.theme}
          type="button"
          aria-pressed={o.theme === theme}
          className={`btn join-item btn-sm ${o.theme === theme ? "btn-active btn-primary" : "btn-ghost"}`}
          onClick={() => choose(o.theme)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
