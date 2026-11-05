// 端到端测试：开一个真浏览器，把客人和管理员的主要流程从头点到尾。运行：npm run e2e
// 会自动起假 Marzban（8010）和 portal 开发服务器（3000）；已经开着的话直接用。
// 只连本地：e2e/setup.ts 会检查 .dev.vars 指向假 Marzban，指向线上就拒绝跑
import { defineConfig } from "@playwright/test";

// 本机 3000 已经被别的开发服务器占着时，用 E2E_PORT=3100 npm run e2e 换个端口，测试自己起一个新的
const PORT = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/setup.ts",
  // 每条测试最长 4 分钟：管理后台那条在 CI 上要将近 2 分钟（本地不到 1 分钟），原来的 2 分钟限制会偶尔超时
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  // 浏览器语言设成中文：没选过语言时页面按浏览器语言显示，测试按中文写。时区固定北京：时间默认跟随设备的时区，测试里的时间按北京写
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "zh-CN", timezoneId: "Asia/Shanghai" },
  webServer: [
    { command: "node dev/mock-marzban.mjs", port: 8010, reuseExistingServer: true },
    { command: `npx next dev -p ${PORT}`, port: PORT, reuseExistingServer: PORT === 3000, timeout: 180_000 },
  ],
});
