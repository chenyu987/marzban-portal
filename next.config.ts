import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// 让 `next dev` 里也能用 getCloudflareContext() 拿到 D1 和环境变量（本地模拟）
initOpenNextCloudflareForDev();
