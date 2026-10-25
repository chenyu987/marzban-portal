// 端到端测试：开一个真浏览器，把客人和管理员的主要流程从头点到尾。运行：npm run e2e
// 会自动起假 Marzban（8010）和 portal 开发服务器（3000）；已经开着的话直接用。
// 只连本地：e2e/setup.ts 会检查 .dev.vars 指向假 Marzban，指向线上就拒绝跑
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: [
    { command: "node dev/mock-marzban.mjs", port: 8010, reuseExistingServer: true },
    { command: "npm run dev", port: 3000, reuseExistingServer: true, timeout: 180_000 },
  ],
});
