"use client";

import { usePathname } from "next/navigation";

// 页脚里给客人用的联系客服在管理后台不显示（切换语言两边都有）
export default function HideOnAdmin({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return path === "/admin" || path.startsWith("/admin/") ? null : <>{children}</>;
}
