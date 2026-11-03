"use client";

import { usePathname } from "next/navigation";

// 页脚里给客人用的部分（站内链接、联系客服、切换语言）在管理后台不显示
export default function HideOnAdmin({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return path === "/admin" || path.startsWith("/admin/") ? null : <>{children}</>;
}
