import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 和 tsconfig 的 paths 一致：@/ 指向项目根目录
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // e2e/ 是 Playwright 的端到端测试，用 npm run e2e 跑，不归 vitest 管
  test: { exclude: ["e2e/**", "node_modules/**"] },
});
