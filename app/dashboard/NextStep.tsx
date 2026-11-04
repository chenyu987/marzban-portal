"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "../LangContext";

// 买了还没连过的订阅顶上的「下一步：装好 App」引导。右上角 × 能关掉；关了记在这个浏览器里（按订阅分开记），刷新也不再出现
export default function NextStep({ username }: { username: string }) {
  const t = useT();
  const key = `next-step-hidden:${username}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(key)) setHidden(true);
    } catch {
      // 浏览器不让用本地存储就每次都显示
    }
  }, [key]);
  if (hidden) return null;
  return (
    <div className="relative flex flex-col gap-3 rounded-box border border-primary/30 bg-primary/5 p-4" data-testid="next-step">
      <button
        type="button"
        aria-label={t("关闭提示", "Dismiss")}
        className="btn btn-circle btn-ghost btn-xs absolute top-2 right-2 text-base-content/50"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(key, "1");
          } catch {}
        }}
      >
        ✕
      </button>
      <b className="pr-6">{t("下一步：装好 App，把这个订阅导进去", "Next: install an app and import this subscription")}</b>
      <Link href="/tutorial" className="btn btn-primary">
        {t("看安装教程", "Open the setup guide")}
      </Link>
    </div>
  );
}
