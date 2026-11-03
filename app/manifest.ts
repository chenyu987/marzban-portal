import type { MetadataRoute } from "next";
import { site } from "@/site.config";
import { pick } from "@/lib/i18n";

// 手机「添加到主屏幕」后像 App 一样打开，直接进我的订阅
export default function manifest(): MetadataRoute.Manifest {
  const icons: MetadataRoute.Manifest["icons"] = [];
  if (site.logo?.icon192) icons.push({ src: site.logo.icon192, sizes: "192x192", type: "image/png" });
  if (site.logo?.icon512) icons.push({ src: site.logo.icon512, sizes: "512x512", type: "image/png" });
  if (site.logo?.maskable512) icons.push({ src: site.logo.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" });
  return {
    name: site.brand,
    short_name: site.brand,
    description: pick(site.description, "zh"),
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: site.themeColor ?? "#ffffff",
    icons,
  };
}
