import type { Metadata } from "next";

// 只管页面标题和不让搜索引擎收录。权限检查不在这里做（layout 不是每次都重新执行），每个页面和 action 自己调 requireAdmin()
export const metadata: Metadata = { title: "管理后台", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
