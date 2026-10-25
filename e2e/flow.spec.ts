// 主流程：注册 → 下单 → 我已付款 → 管理员确认开通 → 快到期提醒 → 一键续费 → 忘记密码 → 管理员发重置链接 → 设新密码登录；
// 另一条：用余额买套餐、用兑换码续期、提现（管理员打款 / 拒绝退回）。
// 每次用新邮箱注册，不依赖之前的数据；管理员那一步直接调命令行脚本（本地库 + 假 Marzban）
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const run = (args: string[], input = "") =>
  execFileSync("npm", ["run", "-s", ...args], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

async function setMockExpire(username: string, expire: number) {
  const tokenRes = await fetch("http://localhost:8010/api/admin/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "username=admin&password=admin",
  });
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const res = await fetch(`http://localhost:8010/api/user/${username}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ expire }),
  });
  expect(res.ok).toBe(true);
}

// 在本地库里直接执行一条 SQL（给测试账号加余额之类）
const sql = (command: string) =>
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--command", command], { stdio: "ignore" });

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

test("用余额买套餐，用兑换码续期，再提现", async ({ page }) => {
  const email = `e2e-balance-${Date.now()}@example.test`;
  page.on("dialog", (d) => d.accept());
  await register(page, email, "E2eTest-1234");

  // 管理员调整：给这个账号加 ¥30 余额
  sql(
    `INSERT INTO balance_entries (customer_id, amount, kind, created_at)
     SELECT id, 3000, 'adjust', unixepoch() FROM customers WHERE email = '${email}'`,
  );

  // 选余额付：¥45 的买不起（按钮灰掉），¥25 的直接开通
  await page.goto("/plans");
  await page.getByRole("button", { name: "余额（剩 ¥30）" }).click();
  await expect(page.locator('button[value="p3-month"]')).toBeDisabled();
  await page.locator('button[value="p1-month"]').click();
  await expect(page.getByText("用余额开通成功")).toBeVisible();

  // 订阅页有了新订阅，余额剩 ¥5
  await page.goto("/dashboard");
  const title = page.locator(".card-title").filter({ hasText: /^c\d+_\d+$/ }).first();
  await expect(title).toBeVisible();
  const username = await title.innerText();
  await expect(page.getByText("¥5.00")).toBeVisible();

  // 余额不够了，再选余额付时 ¥25 的也买不起
  await page.goto("/plans");
  await page.getByRole("button", { name: "余额（剩 ¥5）" }).click();
  await expect(page.locator('button[value="p1-month"]')).toBeDisabled();

  // 管理员生成兑换码，客人输入后给这个订阅续期
  const code = run(["codes:create", "--", "p1-month"]).match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}/)![0];
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX").fill(code);
  await expect(page.locator('form:has(input[name="code"]) select[name="target"]')).toHaveValue(username);
  await page.getByRole("button", { name: "兑换" }).click();
  await expect(page.getByText("续期成功")).toBeVisible();

  // 提现：剩下的 ¥5 全部提走，余额变 0；管理员打款后显示「已打款」
  const withdraw = async () => {
    await page.goto("/dashboard");
    await page.getByLabel("支付宝账号（手机号或邮箱）").fill("13800000000");
    await page.getByLabel("支付宝实名").fill("测试");
    await page.getByRole("button", { name: "申请提现" }).click();
    await expect(page.getByText("等管理员打款")).toBeVisible();
    return run(["withdrawals", "--", "list"]).split("\n").find((l) => l.includes(email))!.match(/#(\d+)/)![1];
  };
  const first = await withdraw();
  await expect(page.getByText("¥0.00")).toBeVisible();
  expect(run(["withdrawals", "--", "paid", first], "yes\n")).toContain("已标成已打款");
  await page.reload();
  await expect(page.getByText("已打款", { exact: true })).toBeVisible();

  // 再加 ¥3 余额、申请提现，管理员拒绝：余额退回
  sql(
    `INSERT INTO balance_entries (customer_id, amount, kind, created_at)
     SELECT id, 300, 'adjust', unixepoch() FROM customers WHERE email = '${email}'`,
  );
  const second = await withdraw();
  expect(run(["withdrawals", "--", "reject", second, "--note", "测试拒绝"], "yes\n")).toContain("余额已退回");
  await page.reload();
  await expect(page.getByText("没通过，余额已退回")).toBeVisible();
  await expect(page.getByText("¥3.00").first()).toBeVisible();
});
