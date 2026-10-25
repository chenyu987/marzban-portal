import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 和 tsconfig 的 paths 一致：@/ 指向项目根目录
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
