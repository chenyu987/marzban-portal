"use client";

import { createContext, useContext } from "react";
import type { PublicSite } from "@/lib/public-site";

// 浏览器里要用的那一点站点信息（品牌名、logo、客服联系方式），由根布局从服务器传进来。
// 客户端组件不要直接 import site.config：会把整个配置（套餐、收款码、管理员邮箱……）打包进每个页面的 JS，外人打开登录页就能看到
const SiteContext = createContext<PublicSite>({ brand: "", importName: "", support: {} });

export function SiteProvider({ value, children }: { value: PublicSite; children: React.ReactNode }) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): PublicSite {
  return useContext(SiteContext);
}
