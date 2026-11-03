import type { MetadataRoute } from "next";
import { site } from "@/site.config";

// site.noindex 时整站不让搜索引擎抓；否则只挡后台和客人自己的页面
export default function robots(): MetadataRoute.Robots {
  if (site.noindex) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/dashboard", "/plans", "/account"] } };
}
