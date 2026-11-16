"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 等备用机就绪时每 5 秒刷新一次页面数据，最多 3 分钟；就绪了（active 变 false）就停
export default function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const id = setInterval(() => {
      if (++n > 36) clearInterval(id);
      else router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}
