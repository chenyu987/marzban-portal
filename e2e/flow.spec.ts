// 主流程：注册 → 下单 → 我已付款 → 管理员确认开通 → 快到期提醒 → 一键续费 → 忘记密码 → 管理员发重置链接 → 设新密码登录。
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

  // 注册
  await page.goto("/register");
  await page.getByPlaceholder("邮箱").fill(email);
  await page.getByPlaceholder("密码（至少 8 位）").fill(password);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

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
