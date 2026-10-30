// 主流程：注册 → 下单 → 我已付款 → 管理员确认开通 → 快到期提醒 → 一键续费 → 忘记密码 → 管理员发重置链接 → 设新密码登录；
// 另一条：余额付全款、余额抵扣一部分（取消后退回）、用兑换码续期；
// 还有管理后台：登录、网页上确认 / 取消订单、客人管理（加减余额、重置链接、绑定订阅）、兑换码、操作日志。
// 每次用新邮箱注册，不依赖之前的数据；管理员那一步直接调命令行脚本（本地库 + 假 Marzban）
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const run = (args: string[], input = "") =>
  execFileSync("npm", ["run", "-s", ...args], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

// 直接调假 Marzban 的接口（查用户、改到期时间、建用户）
async function mockMarzban(method: string, path: string, body?: object) {
  const tokenRes = await fetch("http://localhost:8010/api/admin/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=admin&password=admin",
  });
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const res = await fetch(`http://localhost:8010/api${path}`, {
    method,
    headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  expect(res.ok).toBe(true);
  return (await res.json()) as { inbounds?: Record<string, string[]>; note?: string };
}
const setMockExpire = (username: string, expire: number) => mockMarzban("PUT", `/user/${username}`, { expire });

// 在本地库里直接执行一条 SQL（给测试账号加余额之类）
const sql = (command: string) =>
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", command], { stdio: "ignore" });
// 执行一条查询，返回结果行
const query = (command: string) =>
  JSON.parse(
    execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--command", command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  )[0].results as Record<string, unknown>[];

async function register(page: Page, email: string, password: string) {
  await page.goto("/register");
  await page.getByPlaceholder("邮箱").fill(email);
  await page.getByPlaceholder("密码（至少 8 位）").fill(password);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function logout(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "退出" }).click();
  await expect(page).toHaveURL(/\/login/);
}

test("客人从注册到续费、忘记密码，管理员确认订单", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  const password = "E2eTest-1234";
  const newPassword = "E2eTest-5678";
  page.on("dialog", (d) => d.accept());

  await register(page, email, password);
  // 还没订阅：绑定框整张卡片显示
  await expect(page.getByRole("heading", { name: "绑定已有订阅" })).toBeVisible();

  // 下单：页面上有订单号、金额和收款码
  await page.goto("/plans");
  await page.locator('button[value="p1-month"]').click();
  const card = page.locator(".card.border").first();
  await expect(card).toContainText("等你付款");
  await expect(card.getByAltText("支付宝收款码")).toBeVisible();
  const orderId = (await card.locator(".card-title").innerText()).match(/\d+/)![0];

  // 我已付款：变成等管理员核对，不能再取消
  await card.getByRole("button", { name: "我已付款" }).click();
  await expect(card).toContainText("等管理员核对");
  await expect(card.getByRole("button", { name: "取消这张单" })).toHaveCount(0);

  // 管理员确认：列表里能看到「说已付」，确认后开通
  expect(run(["orders", "--", "list"])).toContain(`#${orderId}`);
  expect(run(["orders", "--", "confirm", orderId], "yes\n")).toContain(`订单 #${orderId} 记成已付款`);

  // 订阅页出现新订阅
  await page.goto("/dashboard");
  const title = page.locator(".card-title").filter({ hasText: /^c\d+_\d+$/ }).first();
  await expect(title).toBeVisible();
  const username = await title.innerText();

  // 有订阅以后，「绑定已有订阅」收成页面最下面的小链接，点开才有输入框
  await expect(page.getByRole("heading", { name: "绑定已有订阅" })).toHaveCount(0);
  await expect(page.getByPlaceholder("https://.../sub/...")).toBeHidden();
  await page.getByText("还有别的订阅链接？绑定到这个账号").click();
  await expect(page.getByPlaceholder("https://.../sub/...")).toBeVisible();

  // 开出来的用户：所有 VLESS 入站都勾上，没有 Shadowsocks；备注就是 ip=N（IP 监控按这个读）
  const created = await mockMarzban("GET", `/user/${username}`);
  expect(created.inbounds).toEqual({ vless: ["VLESS TCP REALITY", "VLESS NODE2", "VLESS NODE3"] });
  expect(created.note).toMatch(/^ip=\d+$/);

  // 改成还剩 3 天：出现续费提醒，点续费到套餐页并选好这个订阅
  await setMockExpire(username, Math.floor(Date.now() / 1000) + 3 * 86400);
  await page.reload();
  await expect(page.getByText("记得续费")).toBeVisible();
  await page.getByRole("link", { name: "续费", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/plans\\?renew=${username}`));
  await expect(page.locator('select[name="target"]').first()).toHaveValue(username);

  // 忘记密码页面能提交（本地只打印邮件）
  await logout(page);
  await page.getByRole("link", { name: "忘记密码？" }).click();
  // 等跳到忘记密码页再填：登录页也有个「邮箱」输入框，跳转前填会填错地方
  await expect(page).toHaveURL(/\/forgot/);
  await page.getByPlaceholder("邮箱").fill(email);
  await page.getByRole("button", { name: "发送重置链接" }).click();
  await expect(page.getByText("重置链接已经发过去了")).toBeVisible();

  // 管理员生成重置链接 → 设新密码 → 自动登录；同一个链接不能再用
  const link = run(["password:reset-link", "--", email]).match(/http:\/\/localhost:3000\/reset\?token=\S+/)![0];
  await page.goto(link);
  await page.getByPlaceholder("新密码（至少 8 位）").fill(newPassword);
  await page.getByPlaceholder("再输一次").fill(newPassword);
  await page.getByRole("button", { name: "保存并登录" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(link);
  await expect(page.getByText("这个链接已经失效了")).toBeVisible();

  // 用新密码登录
  await logout(page);
  await page.getByPlaceholder("邮箱").fill(email);
  await page.getByPlaceholder("密码", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("余额付全款、余额抵扣一部分，再用兑换码续期", async ({ page }) => {
  const email = `e2e-balance-${Date.now()}@example.test`;
  page.on("dialog", (d) => d.accept());
  await register(page, email, "E2eTest-1234");

  // 管理员调整：给这个账号加 ¥30 余额
  sql(
    `INSERT INTO balance_entries (customer_id, amount, kind, created_at)
     SELECT id, 3000, 'adjust', unixepoch() FROM customers WHERE email = '${email}'`,
  );

  // 默认勾选「用余额抵扣」：¥25 的余额够付全款，直接开通
  await page.goto("/plans");
  await expect(page.getByLabel("用余额抵扣（剩 ¥30）")).toBeChecked();
  await page.locator('button[value="p1-month"]').click();
  await expect(page.getByText("用余额开通成功")).toBeVisible();

  // 订阅页有了新订阅，余额剩 ¥5
  await page.goto("/dashboard");
  const title = page.locator(".card-title").filter({ hasText: /^c\d+_\d+$/ }).first();
  await expect(title).toBeVisible();
  const username = await title.innerText();
  await expect(page.getByText("¥5.00")).toBeVisible();

  // 余额不够付全款：抵扣 ¥5，还要转 ¥20；管理员列表里显示的也是 ¥20
  await page.goto("/plans");
  await page.locator('button[value="p1-month"]').click();
  const card = page.locator(".card.border").first();
  await expect(card).toContainText("请转账 ¥20");
  await expect(card).toContainText("已用余额抵扣 ¥5");
  const orderId = (await card.locator(".card-title").innerText()).match(/\d+/)![0];
  expect(run(["orders", "--", "list", "20"])).toContain(`#${orderId}`);
  await page.goto("/dashboard");
  await expect(page.getByText("¥0.00")).toBeVisible();

  // 客人取消：抵扣的余额退回
  await page.goto("/plans");
  await card.getByRole("button", { name: "取消这张单" }).click();
  await expect(page.locator(".card.border")).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page.getByText("¥5.00")).toBeVisible();

  // 管理员生成兑换码，客人输入后给这个订阅续期
  await page.goto("/plans");
  const code = run(["codes:create", "--", "p1-month"]).match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}/)![0];
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX").fill(code);
  await expect(page.locator('form:has(input[name="code"]) select[name="target"]')).toHaveValue(username);
  await page.getByRole("button", { name: "兑换" }).click();
  await expect(page.getByText("续期成功")).toBeVisible();
});

test("管理后台：登录、确认和取消订单、客人管理、兑换码、日志", async ({ page, browser }) => {
  const stamp = Date.now();
  const customer = `e2e-admin-c-${stamp}@example.test`;
  const adminEmail = `e2e-admin-${stamp}@example.test`;
  const adminPassword = "E2eAdmin-123456";
  page.on("dialog", (d) => d.accept());

  // 管理员只能用命令建
  run(["admin:create", "--", adminEmail], `${adminPassword}\n${adminPassword}\n`);

  // 客人下两张单，第一张点「我已付款」
  await register(page, customer, "E2eTest-1234");
  await page.goto("/plans");
  await page.locator('button[value="p1-month"]').click();
  const first = (await page.locator(".card.border .card-title").first().innerText()).match(/\d+/)![0];
  await page.locator(".card.border").first().getByRole("button", { name: "我已付款" }).click();
  await expect(page.locator(".card.border").first()).toContainText("等管理员核对");
  await page.locator('button[value="p1-quarter"]').click();
  await expect(page.locator(".card.border")).toHaveCount(2);
  const second = (await page.locator(".card.border .card-title").first().innerText()).match(/\d+/)![0];

  // 客人的登录进不了后台：会被带到后台自己的登录页
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);

  // 管理员在另一个浏览器里登录（密码错先失败一次）
  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  admin.on("dialog", (d) => d.accept());
  await admin.goto("/admin/login");
  await admin.getByPlaceholder("管理员邮箱").fill(adminEmail);
  await admin.getByPlaceholder("密码").fill("wrong-password-123");
  await admin.getByRole("button", { name: "登录" }).click();
  await expect(admin.getByText("邮箱或密码不对")).toBeVisible();
  await admin.getByPlaceholder("密码").fill(adminPassword);
  await admin.getByRole("button", { name: "登录" }).click();
  await expect(admin).toHaveURL(/\/admin$/);

  // 第一张：客人说已付，确认收款并开通
  const firstCard = admin.locator(".card", { hasText: `订单 ${first}` });
  await expect(firstCard).toContainText("说已付");
  await firstCard.getByRole("button", { name: "确认收款并开通" }).click();
  await expect(admin.getByText(`订单 ${first} 已确认`)).toBeVisible();

  // 第二张：取消
  const secondCard = admin.locator(".card", { hasText: `订单 ${second}` });
  await secondCard.getByRole("button", { name: "取消" }).click();
  await expect(admin.getByText(`订单 ${second} 已取消`)).toBeVisible();

  // 客人那边：订阅开通了，第二张单不见了
  await page.goto("/dashboard");
  await expect(page.locator(".card-title").filter({ hasText: /^c\d+_\d+$/ }).first()).toBeVisible();
  await page.goto("/plans");
  await expect(page.locator(".card.border")).toHaveCount(0);

  // 客人管理：搜到客人、进详情
  await admin.goto(`/admin/customers?q=${encodeURIComponent(customer)}`);
  await admin.getByRole("link", { name: customer }).click();
  await expect(admin.getByRole("heading", { name: customer })).toBeVisible();

  // 加 ¥10 余额（要写原因）；扣 ¥100 扣不了
  await admin.getByPlaceholder("金额，扣钱写负数，如 -5").fill("10");
  await admin.getByPlaceholder("原因（必填）").fill("测试补偿");
  await admin.getByRole("button", { name: "确定" }).click();
  await expect(admin.getByText("已加 10.00 元")).toBeVisible();
  await admin.getByPlaceholder("金额，扣钱写负数，如 -5").fill("-100");
  await admin.getByPlaceholder("原因（必填）").fill("测试扣太多");
  await admin.getByRole("button", { name: "确定" }).click();
  await expect(admin.getByText("余额不够扣")).toBeVisible();
  await admin.reload();
  await expect(admin.getByText("管理员调整：测试补偿")).toBeVisible();

  // 生成重置密码链接
  await admin.getByRole("button", { name: "生成链接" }).click();
  await expect(admin.locator("code", { hasText: "/reset?token=" })).toBeVisible();

  // 绑定 Marzban 上已有的用户
  const oldUser = `old${stamp % 100000000}`;
  await mockMarzban("POST", "/user", { username: oldUser, expire: Math.floor(Date.now() / 1000) + 30 * 86400 });
  await admin.getByPlaceholder("Marzban 用户名").fill(oldUser);
  await admin.getByRole("button", { name: "绑定" }).click();
  await expect(admin.getByText(`已把 ${oldUser} 绑到 ${customer} 名下`)).toBeVisible();
  await admin.reload();
  await expect(admin.getByText(oldUser, { exact: true })).toBeVisible();

  // 兑换码：生成 2 个，作废一个，客人用另一个
  await admin.goto("/admin/codes");
  await admin.locator('select[name="plan"]').selectOption("p1-month");
  await admin.locator('input[name="count"]').fill("2");
  await admin.getByPlaceholder("备注，比如「微信转账 张三」").fill("e2e 测试");
  await admin.getByRole("button", { name: "生成" }).click();
  const codes = (await admin.locator("textarea").inputValue()).split("\n");
  expect(codes).toHaveLength(2);
  await admin.locator("tr", { hasText: codes[0] }).getByRole("button", { name: "作废" }).click();
  await expect(admin.locator("tr", { hasText: codes[0] })).toContainText("已作废");

  await page.goto("/plans");
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX").fill(codes[1]);
  await page.getByRole("button", { name: "兑换" }).click();
  await expect(page.getByText("续期成功")).toBeVisible();
  await admin.reload();
  await expect(admin.locator("tr", { hasText: codes[1] })).toContainText(customer);
  await expect(admin.locator("tr", { hasText: codes[0] })).toHaveCount(0);

  // 日志页能按操作筛
  await admin.goto("/admin/logs?action=codes.create");
  await expect(admin.locator("tbody tr", { hasText: adminEmail })).toContainText("2 个：e2e 测试");

  // 操作日志：每一步都记了（扣钱失败的那次没有改数据，不记）
  const logs = query(`SELECT action, target FROM admin_logs WHERE admin_email = '${adminEmail}' ORDER BY id`);
  expect(logs.map((l) => l.action)).toEqual([
    "login.fail",
    "login",
    "order.confirm",
    "order.cancel",
    "balance.adjust",
    "password.reset_link",
    "subscription.bind",
    "codes.create",
    "code.void",
  ]);

  // 退出后回到登录页
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "退出" }).click();
  await expect(admin).toHaveURL(/\/admin\/login/);
  await ctx.close();
});
