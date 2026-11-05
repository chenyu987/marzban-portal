// 主流程：注册 → 下单 → 我已付款（马上开通） → 快到期提醒 → 一键续费 → 忘记密码 → 管理员发重置链接 → 设新密码登录；
// 另一条：余额付全款、余额抵扣一部分（付款时才扣，取消就不占用）、用兑换码续期；
// 还有管理后台：登录、对账（确认到账 / 没收到钱收回）、取消订单、客人管理（加减余额、重置链接、绑定订阅）、兑换码、操作日志。
// 还有老客人：注册时微信号对上，管理员之前开的订阅自动出现在「我的订阅」，改微信号也跟着走。
// 还有手机：右上角菜单、下单后弹出付款窗、买了还没用的订阅顶上引导看安装教程。
// 还有兜底：网站刚更新、旧页面点按钮出错时自动刷新一次；微信内置浏览器提示换浏览器打开。
// 每次用新邮箱注册，不依赖之前的数据；管理员那一步直接调命令行脚本（本地库 + 假 Marzban）
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { site } from "../site.config";

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

// 订阅的随机编号（订阅页上显示成 7F3A-9C21）
const usernameCode = (username: string) => {
  const c = String(query(`SELECT code FROM subscriptions WHERE marzban_username = '${username}'`)[0].code);
  return `${c.slice(0, 4)}-${c.slice(4)}`;
};
// 订阅页上只显示随机的订阅编号（7F3A-9C21），按编号从库里查回 Marzban 用户名
const usernameOf = (code: string) =>
  String(query(`SELECT marzban_username FROM subscriptions WHERE code = '${code.replace("-", "")}'`)[0].marzban_username);

async function register(page: Page, email: string, password: string) {
  await page.goto("/register");
  await page.getByPlaceholder("邮箱").fill(email);
  await page.getByPlaceholder("密码（至少 8 位）").fill(password);
  await page.getByPlaceholder("微信号").fill("e2e_wx_test");
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

// 客人页面的确认框是页面里自己画的（不是浏览器的 confirm），点里面的确定按钮
async function confirmOk(page: Page) {
  const dialog = page.locator("dialog[open]");
  await dialog.locator(".modal-action button").last().click();
  await expect(dialog).toHaveCount(0);
}

async function logout(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "退出" }).click();
  await expect(page).toHaveURL(/\/login/);
}

test("首页不公开介绍：只有登录和注册，注册按钮带上推荐码", async ({ page }) => {
  await page.goto("/?ref=ABCD2345");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "登录", exact: true })).toBeVisible();
  // 没登录看不到价格、卖点、节点
  await expect(page.locator("main")).not.toContainText("¥");
  await expect(page.locator("body")).not.toContainText("东京");
  await expect(page.locator("body")).not.toContainText("ChatGPT");
  // 安装教程要登录（里面有客户端名字）
  await page.goto("/tutorial");
  await expect(page).toHaveURL(/\/login/);
  // 推荐链接带来的，注册页自动填好推荐码
  await page.goto("/?ref=ABCD2345");
  await page.getByRole("link", { name: "注册", exact: true }).click();
  await expect(page).toHaveURL(/\/register\?ref=ABCD2345/);
  await expect(page.getByPlaceholder("推荐码（选填）")).toHaveValue("ABCD2345");
  // 登录页左边只有品牌名，不放卖点；内容在那半边正中间
  await expect(page.locator("aside")).not.toContainText("ChatGPT");
  const aside = await page.locator("aside").boundingBox();
  const content = await page.getByTestId("auth-aside").boundingBox();
  const center = (b: { x: number; y: number; width: number; height: number } | null) => [(b?.x ?? 0) + (b?.width ?? 0) / 2, (b?.y ?? 0) + (b?.height ?? 0) / 2];
  const [ax, ay] = center(aside);
  const [cx, cy] = center(content);
  expect(Math.abs(ax - cx)).toBeLessThan(4);
  expect(Math.abs(ay - cy)).toBeLessThan(4);
  // 浏览器标签和主屏幕图标、manifest 都在
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.start_url).toBe("/dashboard");
  expect(manifest.icons.length).toBeGreaterThan(0);
  expect((await page.request.get(manifest.icons[0].src)).ok()).toBe(true);
});

test("没登录能打开的页面，浏览器拿到的 JS 里没有站点配置（管理员邮箱、收款码、套餐、客户端名字）", async ({ request }) => {
  const secrets = [...(site.admin?.emails ?? []), ...site.payments.map((p) => p.qr), ...site.plans.map((p) => p.name), "Shadowrocket", "openai.com"];
  for (const path of ["/", "/login", "/register", "/forgot"]) {
    const html = await (await request.get(path)).text();
    const scripts = [...new Set(html.match(/\/_next\/static\/[^"\\]+\.js/g) ?? [])];
    expect(scripts.length).toBeGreaterThan(0);
    const bodies = [html, ...(await Promise.all(scripts.map(async (src) => (await request.get(src)).text())))];
    for (const secret of secrets) {
      expect(bodies.some((b) => b.includes(secret)), `${path} 里出现了 ${secret}`).toBe(false);
    }
  }
});

test("后台域名的根目录直接进后台（带 Cloudflare Access 的头），客人域名不受影响", async ({ request }) => {
  const admin = await request.get("/", { headers: { "cf-access-jwt-assertion": "x" }, maxRedirects: 0 });
  expect(admin.status()).toBe(307);
  expect(admin.headers().location).toMatch(/\/admin$/);
  const guest = await request.get("/", { maxRedirects: 0 });
  expect(guest.status()).toBe(200);
});

test("不让搜索引擎收录：页面带 noindex，robots.txt 禁止抓取", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Disallow: \/\s*$/m);
  // 首页口径低调：不提视频网站
  await expect(page.locator("body")).not.toContainText("YouTube");
  await expect(page.locator("body")).not.toContainText("Netflix");
});

test("打错网址：带品牌的 404，能回首页", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "这个页面不存在" })).toBeVisible();
  await page.getByRole("link", { name: "回首页" }).click();
  await expect(page).toHaveURL(/\/$/);
  // 每页底部有导航和版权
  await expect(page.locator("footer")).toContainText("安装教程");
});

test("网站刚更新、旧页面点登录：自动刷新一次，一分钟内再出错就停在提示上", async ({ page }) => {
  // 假装服务器已经换了新版本：登录表单提交时回「找不到这个 Server Action」
  await page.route("**/login", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 404, headers: { "x-nextjs-action-not-found": "1" }, body: "" })
      : route.continue(),
  );
  const submit = async () => {
    await page.getByPlaceholder("邮箱").fill("stale@example.test");
    await page.getByPlaceholder("密码").fill("whatever-123");
    await page.getByRole("button", { name: "登录" }).click();
  };
  await page.goto("/login");
  const reloaded = page.waitForEvent("load");
  await submit();
  await reloaded;
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
  await submit();
  await expect(page.getByText("网站刚更新过，刷新一下页面就好。")).toBeVisible();
});

test("在微信里打开：顶部提示换浏览器，别的浏览器没有", async ({ browser, page }) => {
  const wechat = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50",
  });
  const wx = await wechat.newPage();
  await wx.goto(new URL("/login", test.info().project.use.baseURL).toString());
  await expect(wx.getByRole("alert").filter({ hasText: "在浏览器打开" })).toBeVisible();
  await wechat.close();
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
  await expect(page.getByText("在浏览器打开")).toHaveCount(0);
});

test("老客人注册：微信号对上的订阅自动绑过来，改微信号后还在，别人再用这个微信号拿不走", async ({ page, browser }) => {
  const stamp = Date.now();
  const wechat = `E2E-Claim-${stamp}`;
  const base = `e2e_claim_${stamp}`;
  const expire = Math.floor(Date.now() / 1000) + 30 * 86400;
  // 管理员在 Marzban 上按微信号建的用户（第一个、第二个），和一个记了微信号的老订阅（用户名是微信名）
  await mockMarzban("POST", "/user", { username: base, expire });
  await mockMarzban("POST", "/user", { username: `${base}_2`, expire });
  // 前缀一样但不是这个微信号的，不能被认走
  await mockMarzban("POST", "/user", { username: `${base}0`, expire });
  const legacy = `e2e_old_${stamp}`;
  await mockMarzban("POST", "/user", { username: legacy, expire });
  sql(`INSERT INTO marzban_users (marzban_username, wechat) VALUES ('${legacy}', '${wechat.toLowerCase()}')`);

  const signUp = async (p: Page, email: string, wx: string) => {
    await p.goto("/register");
    await p.getByPlaceholder("邮箱").fill(email);
    await p.getByPlaceholder("密码（至少 8 位）").fill("E2eTest-1234");
    await p.getByPlaceholder("微信号").fill(wx);
    await p.getByRole("button", { name: "注册" }).click();
    await expect(p).toHaveURL(/\/dashboard/);
  };
  const email = `e2e-claim-${stamp}@example.test`;
  await signUp(page, email, wechat);
  await expect(page.getByTestId("sub-id")).toHaveCount(3);
  const owned = () =>
    query(`SELECT s.marzban_username AS u FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE c.email = '${email}' ORDER BY u`).map((r) => r.u);
  expect(owned()).toEqual([base, `${base}_2`, legacy].sort());
  const logged = query(`SELECT COUNT(*) AS n FROM admin_logs WHERE action = 'subscription.auto_bind' AND target = '${email}'`)[0].n;
  expect(logged).toBe(3);

  // 改微信号：订阅还在他名下，老订阅记的微信号跟着改
  await page.goto("/account");
  await page.getByLabel("微信号").fill(`e2e_claim2_${stamp}`);
  await page.getByRole("button", { name: "保存微信号" }).click();
  await expect(page.getByText("微信号已更新")).toBeVisible();
  expect(owned()).toEqual([base, `${base}_2`, legacy].sort());
  expect(query(`SELECT wechat FROM marzban_users WHERE marzban_username = '${legacy}'`)[0].wechat).toBe(`e2e_claim2_${stamp}`);

  // 别人用原来的微信号注册：已经绑走的拿不到
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signUp(other, `e2e-claim-other-${stamp}@example.test`, wechat);
  await expect(other.getByTestId("sub-id")).toHaveCount(0);
  await ctx.close();
});

test("订阅没绑客人、也找不到这个微信号的客人：管理员先记下微信号，客人用它注册后自动绑过来", async ({ page, browser }) => {
  const stamp = Date.now();
  const sub = `e2e_note_${stamp}`;
  const wechat = `e2e_notewx_${stamp}`;
  const adminEmail = `e2e-note-admin-${stamp}@example.test`;
  const adminPassword = "E2eAdmin-123456";
  run(["admin:create", "--", adminEmail], `${adminPassword}\n${adminPassword}\n`);
  await mockMarzban("POST", "/user", { username: sub, expire: Math.floor(Date.now() / 1000) + 30 * 86400 });

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  admin.on("dialog", (d) => d.accept());
  await admin.goto("/admin/login");
  await admin.getByPlaceholder("管理员邮箱").fill(adminEmail);
  await admin.getByPlaceholder("密码").fill(adminPassword);
  await admin.getByRole("button", { name: "登录" }).click();
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.goto(`/admin/users/${sub}`);
  await admin.getByLabel("绑到客人").fill(wechat);
  await admin.getByRole("button", { name: "绑到这个客人" }).click();
  await expect(admin.getByText(`没有邮箱或微信号是 ${wechat} 的客人`)).toBeVisible();
  await admin.getByRole("button", { name: "记下这个微信号" }).click();
  await expect(admin.getByText(`已记下微信号 ${wechat}`)).toBeVisible();
  await expect(admin.getByTestId("sub-owner")).toContainText("还没注册网站账号");
  expect(query(`SELECT wechat FROM marzban_users WHERE marzban_username = '${sub}'`)[0].wechat).toBe(wechat);
  expect(query(`SELECT COUNT(*) AS n FROM admin_logs WHERE action = 'user.set_wechat' AND target = '${sub}'`)[0].n).toBe(1);
  await ctx.close();

  // 客人用这个微信号注册：订阅自动出现在「我的订阅」
  await page.goto("/register");
  await page.getByPlaceholder("邮箱").fill(`e2e-note-${stamp}@example.test`);
  await page.getByPlaceholder("密码（至少 8 位）").fill("E2eTest-1234");
  await page.getByPlaceholder("微信号").fill(wechat);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page.getByTestId("sub-id")).toHaveCount(1);
});

test("防机器人：同一个 IP 一小时内最多注册 3 个账号", async ({ browser }) => {
  const stamp = Date.now();
  // 本地没有 cf-connecting-ip 时不限；这里假装是线上的同一个 IP
  const ip = `198.51.100.${stamp % 250}`;
  const ctx = await browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": ip } });
  const page = await ctx.newPage();
  const signUp = async (i: number) => {
    await page.context().clearCookies();
    await page.goto("/register");
    await page.getByPlaceholder("邮箱").fill(`e2e-rl-${stamp}-${i}@example.test`);
    await page.getByPlaceholder("密码（至少 8 位）").fill("E2eTest-1234");
    await page.getByPlaceholder("微信号").fill(`e2e_rl_${stamp}`);
    await page.getByRole("button", { name: "注册" }).click();
  };
  for (const i of [1, 2, 3]) {
    await signUp(i);
    await expect(page).toHaveURL(/\/dashboard/);
  }
  await signUp(4);
  await expect(page.getByText("这个网络最近注册的账号太多了")).toBeVisible();
  expect(query(`SELECT COUNT(*) AS n FROM customers WHERE email = 'e2e-rl-${stamp}-4@example.test'`)[0].n).toBe(0);
  await ctx.close();
});

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
test("手机上：右上角菜单能切页面、能退出；买了还没连过的订阅顶上有「看安装教程」，能关掉，连上过就不显示", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
  const page = await ctx.newPage();
  const stamp = Date.now();
  const wechat = `e2e_mobile_${stamp}`;
  // 管理员按微信号开好的订阅，注册时自动绑过来
  await mockMarzban("POST", "/user", { username: wechat, expire: Math.floor(Date.now() / 1000) + 30 * 86400 });
  await page.goto("/register");
  await page.getByPlaceholder("邮箱").fill(`e2e-mobile-${stamp}@example.test`);
  await page.getByPlaceholder("密码（至少 8 位）").fill("E2eTest-1234");
  await page.getByPlaceholder("微信号").fill(wechat);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const next = page.getByTestId("next-step");
  await expect(next).toBeVisible();
  // iPhone 上大的「一键导入」是 Shadowrocket，别的 App 在「其他方式」里
  await expect(page.getByTestId("main-import")).toHaveText("一键导入 Shadowrocket");
  await expect(page.getByRole("link", { name: "导入 Clash Verge" })).toBeVisible();
  // 点了大按钮（没装 App 时什么反应都没有）：下面提示先看安装教程
  await expect(page.getByTestId("import-hint")).toHaveCount(0);
  await page.getByTestId("main-import").click();
  await expect(page.getByTestId("import-hint")).toContainText("可能还没装 Shadowrocket");
  await page.getByTestId("import-hint").getByRole("link", { name: "先看安装教程装好" }).click();
  await expect(page).toHaveURL(/\/tutorial/);
  await page.goto("/dashboard");
  await next.getByRole("link", { name: "看安装教程" }).click();
  await expect(page).toHaveURL(/\/tutorial/);
  // 不想看可以点 × 关掉，刷新也不再出现
  await page.goto("/dashboard");
  await next.getByRole("button", { name: "关闭提示" }).click();
  await expect(next).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("sub-id")).toBeVisible();
  await expect(next).toHaveCount(0);

  // 连上过一次：引导不再显示（先清掉上面「关掉」的记录，确认是因为连上过才不显示）
  await page.evaluate(() => localStorage.clear());
  await mockMarzban("PUT", `/user/${wechat}`, { online_at: new Date().toISOString().slice(0, 19) });
  await page.goto("/dashboard");
  await expect(page.getByTestId("sub-id")).toBeVisible();
  await expect(page.getByTestId("next-step")).toHaveCount(0);

  // 右上角菜单：收着时不显示；点开四个页面和退出都在，当前页高亮；× 关掉；点页面过去后菜单自己收起
  const menu = page.getByRole("dialog", { name: "菜单" });
  await expect(menu).toHaveCount(0);
  await page.getByRole("button", { name: "打开菜单" }).click();
  for (const name of ["我的订阅", "购买/续费", "安装教程", "账户"]) await expect(menu.getByRole("link", { name })).toBeVisible();
  await expect(menu.getByRole("link", { name: "我的订阅" })).toHaveAttribute("aria-current", "page");
  await menu.getByRole("button", { name: "关闭菜单" }).click();
  await expect(menu).toHaveCount(0);
  await page.getByRole("button", { name: "打开菜单" }).click();
  await menu.getByRole("link", { name: "账户" }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(menu).toHaveCount(0);
  // 菜单最下面是退出
  await page.getByRole("button", { name: "打开菜单" }).click();
  await menu.getByRole("button", { name: "退出" }).click();
  await expect(page).toHaveURL(/\/login/);
  await ctx.close();
});

test("过期、被删掉的订阅能从主页隐藏，记录留着；又续上了自动重新显示", async ({ page }) => {
  const stamp = Date.now();
  const wechat = `e2e_hide_${stamp}`;
  const now = Math.floor(Date.now() / 1000);
  await mockMarzban("POST", "/user", { username: wechat, expire: now - 86400 });
  await page.goto("/register");
  await page.getByPlaceholder("邮箱").fill(`e2e-hide-${stamp}@example.test`);
  await page.getByPlaceholder("密码（至少 8 位）").fill("E2eTest-1234");
  await page.getByPlaceholder("微信号").fill(wechat);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const confirm = page.getByRole("dialog", { name: "确认" });

  // 订阅编号点一下就复制，过一会儿换回编号
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const subId = page.getByTestId("sub-id");
  const code = (await subId.getAttribute("data-code"))!;
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  await subId.click();
  await expect(subId).toHaveText("已复制 ✓");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await expect(subId).toHaveText(code);

  // 过期的：卡片底下有「从主页隐藏」，确认后不显示，底部能重新显示
  await page.getByRole("button", { name: "从主页隐藏" }).click();
  await confirm.getByRole("button", { name: "隐藏" }).click();
  await expect(page.getByTestId("sub-id")).toHaveCount(0);
  const hidden = page.getByTestId("hidden-subs");
  await expect(hidden).toContainText("已隐藏 1 个");
  await expect(hidden).toContainText("已过期");
  expect(query(`SELECT hidden_at FROM subscriptions WHERE marzban_username = '${wechat}'`)[0].hidden_at).toBeTruthy();
  // 隐藏了的，购买/续费页也不能选它续期（客人只剩新开一个订阅）
  await page.goto("/plans");
  await expect(page.getByRole("heading", { name: "购买套餐" })).toBeVisible();
  await expect(page.locator(`[name="target"][value="${wechat}"], [name="target"] option[value="${wechat}"]`)).toHaveCount(0);
  await expect(page.getByText("买给哪个订阅")).toHaveCount(0);
  await page.goto("/dashboard");
  await hidden.locator("summary").click();
  await hidden.getByRole("button", { name: "重新显示" }).click();
  await expect(page.getByTestId("sub-id")).toBeVisible();
  await expect(page.getByTestId("hidden-subs")).toHaveCount(0);

  // 再隐藏一次，然后续上了：自动重新显示，不用客人去点
  await page.getByRole("button", { name: "从主页隐藏" }).click();
  await confirm.getByRole("button", { name: "隐藏" }).click();
  await expect(page.getByTestId("sub-id")).toHaveCount(0);
  await mockMarzban("PUT", `/user/${wechat}`, { expire: now + 30 * 86400, status: "active" });
  await page.goto("/dashboard");
  await expect(page.getByTestId("sub-id")).toBeVisible();
  // 续上了，续费页又能选它
  await page.goto("/plans");
  await expect(page.locator(`[name="target"][value="${wechat}"], [name="target"] option[value="${wechat}"]`).first()).toBeAttached();
  await page.goto("/dashboard");
  // 没过期的订阅没有隐藏按钮
  await expect(page.getByRole("button", { name: "从主页隐藏" })).toHaveCount(0);

  // Marzban 上删掉了：直说查不到了，也能隐藏；subscriptions 那一行还在
  await mockMarzban("DELETE", `/user/${wechat}`);
  await page.goto("/dashboard");
  await expect(page.getByTestId("sub-gone")).toContainText("查不到这个订阅了");
  await page.getByRole("button", { name: "从主页隐藏" }).click();
  await confirm.getByRole("button", { name: "隐藏" }).click();
  await expect(page.getByTestId("sub-gone")).toHaveCount(0);
  await expect(page.getByTestId("hidden-subs")).toContainText("已删除");
  expect(query(`SELECT 1 FROM subscriptions WHERE marzban_username = '${wechat}'`)).toHaveLength(1);
});

test("邀请朋友：每个朋友一行，写一共返了多少，点开看每笔付款", async ({ browser }) => {
  const stamp = Date.now();
  const me = await (await browser.newContext()).newPage();
  await register(me, `e2e-ref-${stamp}@example.test`, "E2eTest-1234");
  const code = query(`SELECT referral_code FROM customers WHERE email = 'e2e-ref-${stamp}@example.test'`)[0].referral_code as string;
  const friendPage = await (await browser.newContext()).newPage();
  await friendPage.goto(`/register?ref=${code}`);
  await friendPage.getByPlaceholder("邮箱").fill(`e2e-ref-f-${stamp}@example.test`);
  await friendPage.getByPlaceholder("密码（至少 8 位）").fill("E2eTest-1234");
  await friendPage.getByPlaceholder("微信号").fill(`e2e_ref_f_${stamp}`);
  await friendPage.getByRole("button", { name: "注册" }).click();
  await expect(friendPage).toHaveURL(/\/dashboard/);

  const card = me.getByTestId("referral-card");
  await me.reload();
  await expect(card.getByTestId("referrals")).toContainText(`微信 e2e_ref_f_${stamp}`);
  await expect(card.getByTestId("referrals")).toContainText("还没付款");
  // 朋友付了两笔：一行里写一共返了 ¥8.00，点开看到两笔
  const fid = query(`SELECT id FROM customers WHERE email = 'e2e-ref-f-${stamp}@example.test'`)[0].id;
  sql(`INSERT INTO orders (customer_id, amount, method, status, paid_at, created_at) VALUES (${fid}, 4500, 'manual', 'paid', 1793700000, 1793700000), (${fid}, 3500, 'manual', 'paid', 1793710000, 1793710000)`);
  await me.reload();
  const row = card.getByTestId("referrals").locator("details");
  await expect(row).toHaveCount(1);
  await expect(row.locator("summary")).toContainText("+¥8.00");
  await expect(card).toContainText("累计返利");
  await row.locator("summary").click();
  await expect(row).toContainText("付款 ¥45.00");
  await expect(row).toContainText("+¥4.50");
  await expect(row).toContainText("付款 ¥35.00");

  // 转账单：朋友点了「我已付款」（已开通、还没对账）不返；管理员确认到账后才返
  sql(`INSERT INTO orders (customer_id, amount, method, status, paid_at, created_at) VALUES (${fid}, 10000, 'transfer', 'paid', 1793720000, 1793720000)`);
  const transferId = query(`SELECT id FROM orders WHERE customer_id = ${fid} AND method = 'transfer' ORDER BY id DESC LIMIT 1`)[0].id;
  expect(query(`SELECT COUNT(*) AS n FROM balance_entries WHERE order_id = ${transferId} AND kind = 'referral_reward'`)[0].n).toBe(0);
  await me.reload();
  await expect(row.locator("summary")).toContainText("+¥8.00");
  sql(`UPDATE orders SET verified_at = 1793730000 WHERE id = ${transferId}`);
  await me.reload();
  await expect(row.locator("summary")).toContainText("+¥18.00");
});

test("管理员删除客人：名下订阅从 Marzban 删掉，账号注销，记录留着，同一个邮箱能重新注册", async ({ page, browser }) => {
  const stamp = Date.now();
  const wechat = `e2e_del_${stamp}`;
  const email = `e2e-del-${stamp}@example.test`;
  const adminEmail = `e2e-del-admin-${stamp}@example.test`;
  const adminPassword = "E2eAdmin-123456";
  run(["admin:create", "--", adminEmail], `${adminPassword}\n${adminPassword}\n`);
  await mockMarzban("POST", "/user", { username: wechat, expire: Math.floor(Date.now() / 1000) + 30 * 86400 });
  await page.goto("/register");
  await page.getByPlaceholder("邮箱").fill(email);
  await page.getByPlaceholder("密码（至少 8 位）").fill("E2eTest-1234");
  await page.getByPlaceholder("微信号").fill(wechat);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page.getByTestId("sub-id")).toBeVisible();
  const id = query(`SELECT id FROM customers WHERE email = '${email}'`)[0].id;

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await admin.goto("/admin/login");
  await admin.getByPlaceholder("管理员邮箱").fill(adminEmail);
  await admin.getByPlaceholder("密码").fill(adminPassword);
  await admin.getByRole("button", { name: "登录" }).click();
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.goto(`/admin/customers/${id}`);
  // 输错邮箱不删
  admin.once("dialog", (d) => d.accept("wrong@example.test"));
  await admin.getByRole("button", { name: "删除客人和 1 个订阅" }).click();
  await expect(admin).toHaveURL(new RegExp(`/admin/customers/${id}$`));
  admin.once("dialog", (d) => d.accept(email));
  await admin.getByRole("button", { name: "删除客人和 1 个订阅" }).click();
  await expect(admin).toHaveURL(/\/admin\/customers$/);

  // 列表默认不显示，选「已删除的」能看到；订阅从 Marzban 删掉了
  await admin.goto(`/admin/customers?q=${wechat}`);
  await expect(admin.getByRole("link", { name: new RegExp(email) })).toHaveCount(0);
  await admin.goto(`/admin/users?q=${wechat}`);
  await expect(admin.getByTestId("marzban-user")).toHaveCount(0);
  const row = query(`SELECT email, wechat, deleted_at FROM customers WHERE id = ${id}`)[0];
  expect(row.email).toBe(`deleted-${id}@deleted.invalid`);
  expect(row.wechat).toBeNull();
  expect(row.deleted_at).toBeTruthy();
  expect(query(`SELECT 1 FROM subscriptions WHERE customer_id = ${id}`)).toHaveLength(0);
  await admin.goto(`/admin/customers?has=deleted&q=deleted-${id}@`);
  await expect(admin.getByRole("link", { name: new RegExp(`deleted-${id}@`) })).toBeVisible();
  await admin.goto(`/admin/logs?action=customer.delete`);
  await expect(admin.getByText(email)).toBeVisible();
  await ctx.close();

  // 客人那边登录没了；同一个邮箱能重新注册
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/register");
  await page.getByPlaceholder("邮箱").fill(email);
  await page.getByPlaceholder("密码（至少 8 位）").fill("E2eTest-1234");
  await page.getByPlaceholder("微信号").fill(`${wechat}_2`);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("手机上下单：付款窗从底部弹出来，能关掉、刷新不再弹，在弹窗里点我已付款就开通", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const stamp = Date.now();
  await page.goto("/register");
  await page.getByPlaceholder("邮箱").fill(`e2e-mobile-order-${stamp}@example.test`);
  await page.getByPlaceholder("密码（至少 8 位）").fill("E2eTest-1234");
  await page.getByPlaceholder("微信号").fill(`e2e_mo_${stamp}`);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const sheet = page.getByRole("dialog", { name: "付款" });
  await page.goto("/plans");
  await page.locator('button[value="p1-month"]').click();
  await confirmOk(page);
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("下单成功，请付款");
  await expect(sheet.getByAltText("支付宝收款码")).toBeVisible();
  // 关掉：单子还在页面上；刷新也不会再弹
  await sheet.getByRole("button", { name: "关闭" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".card.border")).toContainText("等你付款");
  await page.reload();
  await expect(page.locator(".card.border")).toContainText("等你付款");
  await expect(sheet).toHaveCount(0);
  await page.locator(".card.border").getByRole("button", { name: "取消这张单" }).click();
  await confirmOk(page);
  await expect(page.locator(".card.border")).toHaveCount(0);

  // 取消后「下单成功」的提示跟着消失（不刷新页面）
  const placed = page.getByText("下单成功，请按上面的说明付款");
  await page.locator('button[value="p1-month"]').click();
  await confirmOk(page);
  await sheet.getByRole("button", { name: "关闭" }).click();
  await expect(placed).toBeVisible();
  await page.locator(".card.border").getByRole("button", { name: "取消这张单" }).click();
  await confirmOk(page);
  await expect(page.locator(".card.border")).toHaveCount(0);
  await expect(placed).toHaveCount(0);

  // 再下一单，直接在弹窗里付
  await page.locator('button[value="p1-month"]').click();
  await confirmOk(page);
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("支付宝", { exact: true }).check();
  await sheet.getByRole("button", { name: "我已付款" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("sub-id")).toBeVisible();
  await ctx.close();
});

test("页面底部切换中英文：记住选择，登录页和报错跟着换", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登录客户中心" })).toBeVisible();
  await page.locator("footer").getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  // 服务器返回的报错也是英文
  await page.getByPlaceholder("Email").fill("nobody@example.com");
  await page.getByPlaceholder("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Wrong email or password")).toBeVisible();
  // 换页面、刷新后还是英文
  await page.goto("/forgot");
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
  await page.locator("footer").getByRole("button", { name: "中文" }).click();
  await expect(page.getByRole("button", { name: "发送重置链接" })).toBeVisible();
});

test("没选过语言默认中文（site.config 没开 autoLang）：英文系统打开也是中文，自己切了才是英文", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "en-US" });
  const page = await ctx.newPage();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登录客户中心" })).toBeVisible();
  await page.locator("footer").getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await ctx.close();
});

test("客人从注册到续费、忘记密码，管理员确认订单", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  const password = "E2eTest-1234";
  const newPassword = "E2eTest-5678";
  page.on("dialog", (d) => d.accept());

  await register(page, email, password);
  // 登录后首页直接去「我的订阅」
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard/);
  // 安装教程：没有美区 Apple ID 的可以直接复制客服联系方式；底部有常见问题
  await page.goto("/tutorial");
  await page.getByRole("tab", { name: "iPhone" }).check();
  const appleStep = page.getByRole("listitem").filter({ hasText: "如果没有美区 Apple ID，请联系客服" });
  await expect(appleStep.getByRole("button", { name: /复制客服/ }).first()).toBeVisible();
  await expect(page.getByTestId("tutorial-faq")).toContainText("怎么续费");
  await page.goto("/dashboard");
  // 页面底部有「复制客服邮箱」，客人找客服不用另外去找联系方式
  await expect(page.getByRole("button", { name: /复制客服邮箱/ })).toBeVisible();
  // 新客人：三步上手的引导，第一步能直接去选套餐
  await expect(page.getByTestId("onboarding")).toContainText("选套餐付款");
  // 还没订阅：打个招呼
  await expect(page.getByText(/^你好，/)).toBeVisible();
  // 套餐页：直接在价目表里选，每个价格格子都能点；鼠标移上去浮出「下单」
  await page.goto("/plans");
  await expect(page.getByTestId("plan-table").locator('button[name="plan"]').first()).toBeVisible();
  // 悬停只有动画，格子大小不变（表格不会跳）
  const yearCell = page.locator('button[value="p1-year"]');
  const before = await yearCell.boundingBox();
  await yearCell.hover();
  await expect(yearCell).toContainText("下单");
  await page.waitForTimeout(300);
  const after = await yearCell.boundingBox();
  expect([after?.width, after?.height]).toEqual([before?.width, before?.height]);
  await page.goto("/dashboard");

  // 还没订阅：绑定框整张卡片显示
  await expect(page.getByRole("heading", { name: "绑定已有订阅" })).toBeVisible();

  // 下单：先点价格弹出页面里的确认框，点「取消」什么都不发生
  await page.goto("/plans");
  await page.locator('button[value="p1-month"]').click();
  await page.locator("dialog[open]").getByRole("button", { name: "取消" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".card.border")).toHaveCount(0);
  // 再点一次确定：页面上有订单号、金额和收款码
  await page.locator('button[value="p1-month"]').click();
  await expect(page.locator("dialog[open]")).toContainText("普通版 月付");
  await confirmOk(page);
  const card = page.locator(".card.border").first();
  await expect(card).toContainText("等你付款");
  await expect(card.getByAltText("支付宝收款码")).toBeVisible();

  // 我已付款：选付款方式、填付款人，马上开通，直接跳到订阅页（先开通后对账，不等管理员）
  await card.getByLabel("支付宝", { exact: true }).check();
  await card.getByLabel("付款人").fill("测试付款人");
  await card.getByRole("button", { name: "我已付款" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // 订阅页出现新订阅：标题是套餐档位名，副标题是价目表上的说明，角落是随机的订阅编号（看不出是第几单）
  const title = page.getByTestId("sub-id").first();
  await expect(title).toHaveText(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  const username = usernameOf(await title.innerText());
  // 有订阅了就不再打招呼
  await expect(page.getByText(/^你好，/)).toHaveCount(0);
  // Marzban 用户名用注册时填的微信号；每次 e2e 都用同一个微信号，Marzban 里已经有了就往后加序号
  expect(username).toMatch(/^e2e_wx_test(_\d+)?$/);

  // 有订阅以后，「绑定已有订阅」收成页面最下面的小链接，点开才有输入框
  await expect(page.getByRole("heading", { name: "绑定已有订阅" })).toHaveCount(0);
  await expect(page.getByPlaceholder("https://.../sub/...")).toBeHidden();
  await page.getByText("还有别的订阅链接？绑定到这个账号").click();
  await expect(page.getByPlaceholder("https://.../sub/...")).toBeVisible();

  // 下载 Clash 配置文件：规则模式、带分流规则、存成 .yaml；别人的订阅下载不了
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "下载 Clash 配置文件" }).click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`-${username}\\.yaml$`));
  const clash = readFileSync(await download.path(), "utf8");
  expect(clash).toMatch(/^mode: rule$/m);
  expect(clash).toContain("GEOIP,CN,DIRECT");
  expect((await page.request.get("/dashboard/clash/alice")).status()).toBe(404);

  // 开出来的用户：所有 VLESS 入站都勾上，没有 Shadowsocks；备注就是 ip=N（IP 监控按这个读）
  const created = await mockMarzban("GET", `/user/${username}`);
  expect(created.inbounds).toEqual({ vless: ["VLESS TCP REALITY", "VLESS NODE2", "VLESS NODE3"] });
  expect(created.note).toMatch(/^ip=\d+$/);

  // 还剩 5 天：只有续费按钮，不弹提醒
  await setMockExpire(username, Math.floor(Date.now() / 1000) + 5 * 86400);
  await page.reload();
  await expect(page.getByRole("link", { name: "续费", exact: true })).toBeVisible();
  await expect(page.getByText("记得续费")).toHaveCount(0);
  // 最后 3 天：黄色提醒「记得续费」，点续费到套餐页并选好这个订阅
  await setMockExpire(username, Math.floor(Date.now() / 1000) + 2 * 86400);
  await page.reload();
  await expect(page.getByText(/这个订阅还剩 .*到期，记得续费/)).toBeVisible();
  // 每天的到期提醒：还剩 2 天发「2 天」那封；再跑一次不会重复发
  const notices = () => query(`SELECT days FROM expiry_notices WHERE marzban_username = '${username}'`);
  expect((await page.request.post("/api/cron/expiry")).ok()).toBe(true);
  expect(notices()).toEqual([{ days: 2 }]);
  await page.request.post("/api/cron/expiry");
  expect(notices()).toHaveLength(1);
  // 每 5 分钟的节点掉线检查能跑（判断逻辑在 lib/node-alerts.test.ts；节点状态别的测试会改，这里不对具体节点断言）
  const t0 = Math.floor(Date.now() / 1000);
  const nodesRun = await page.request.post(`/api/cron/nodes?now=${t0}`);
  expect(nodesRun.ok()).toBe(true);
  expect(await nodesRun.json()).toMatchObject({ down: expect.any(Number), sent: expect.any(Number) });
  expect((await page.request.post(`/api/cron/nodes?now=${t0 + 300}`)).ok()).toBe(true);
  await page.getByRole("link", { name: "续费", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/plans\\?renew=${username}`));
  await expect(page.locator(`input[name="target"][value="${username}"]`)).toBeChecked();
  // 续期付款：开通后回到订阅页，提醒客人在客户端里刷新订阅
  await page.locator('button[value="p1-month"]').click();
  await confirmOk(page);
  const renewCard = page.locator(".card.border").first();
  await renewCard.getByLabel("支付宝", { exact: true }).check();
  await renewCard.getByRole("button", { name: "我已付款" }).click();
  await expect(page).toHaveURL(/\/dashboard\?renewed=1/);
  await expect(page.getByTestId("renewed")).toContainText("刷新");

  // 忘记密码页面能提交（本地只打印邮件）
  await logout(page);
  await page.getByRole("link", { name: "忘记密码？" }).click();
  // 等跳到忘记密码页再填：登录页也有个「邮箱」输入框，跳转前填会填错地方
  await expect(page).toHaveURL(/\/forgot/);
  await page.getByPlaceholder("邮箱").fill(email);
  await page.getByRole("button", { name: "发送重置链接" }).click();
  await expect(page.getByText("重置链接已经发过去了")).toBeVisible();

  // 管理员生成重置链接 → 设新密码 → 自动登录；同一个链接不能再用
  // 只取路径：脚本按 site.config 拼的是 3000 端口，本地用 E2E_PORT 换了端口时也能打开
  const link = run(["password:reset-link", "--", email]).match(/\/reset\?token=\S+/)![0];
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

  // 账户页：客人自己改微信号、到期提醒、邮箱、密码
  // 先在另一个浏览器里也登录一次，后面验证改密码会把它踢掉
  const other = await page.context().browser()!.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/login");
  await otherPage.getByPlaceholder("邮箱").fill(email);
  await otherPage.getByPlaceholder("密码", { exact: true }).fill(newPassword);
  await otherPage.getByRole("button", { name: "登录" }).click();
  await expect(otherPage).toHaveURL(/\/dashboard/);

  await page.getByRole("link", { name: "账户" }).click();
  await expect(page.getByRole("heading", { name: "登录的设备" })).toHaveCount(0);
  await page.getByLabel("微信号").fill("坏的 微信");
  await page.getByRole("button", { name: "保存微信号" }).click();
  await expect(page.getByText("微信号格式不对")).toBeVisible();
  await page.getByLabel("微信号").fill("e2e_wx_new");
  await page.getByRole("button", { name: "保存微信号" }).click();
  await expect(page.getByText("微信号已更新")).toBeVisible();
  expect(query(`SELECT wechat FROM customers WHERE email = '${email}'`)[0].wechat).toBe("e2e_wx_new");

  // 到期提醒：关掉后存进库里
  await page.getByLabel("订阅快到期时发邮件提醒我").uncheck();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已保存")).toBeVisible();
  expect(query(`SELECT notify_expiry FROM customers WHERE email = '${email}'`)[0].notify_expiry).toBe(0);

  // 改邮箱：密码错了不让改；别人用过的邮箱不让改；对了就改，之后用新邮箱登录
  const newEmail = email.replace("e2e-", "e2e-new-");
  await page.goto("/account");
  await page.getByLabel("新邮箱").fill(newEmail);
  await page.getByLabel("当前密码（改邮箱）").fill("wrong-password");
  await page.getByRole("button", { name: "改邮箱" }).click();
  await expect(page.getByText("当前密码不对")).toBeVisible();
  await page.getByLabel("当前密码（改邮箱）").fill(newPassword);
  await page.getByRole("button", { name: "改邮箱" }).click();
  await expect(page.getByText(`登录邮箱已改成 ${newEmail}`)).toBeVisible();

  // 改密码：两次不一样被拦；改好后另一台设备被退出
  const third = "E2eTest-9999";
  await page.getByLabel("当前密码", { exact: true }).fill(newPassword);
  await page.getByLabel("新密码", { exact: true }).fill(third);
  await page.getByLabel("再输一次新密码").fill("E2eTest-0000");
  await page.getByRole("button", { name: "改密码" }).click();
  await expect(page.getByText("两次输的新密码不一样")).toBeVisible();
  await page.getByLabel("当前密码", { exact: true }).fill(newPassword);
  await page.getByLabel("新密码", { exact: true }).fill(third);
  await page.getByLabel("再输一次新密码").fill(third);
  await page.getByRole("button", { name: "改密码" }).click();
  await expect(page.getByText("其他地方的登录都已退出")).toBeVisible();
  await otherPage.goto("/dashboard");
  await expect(otherPage).toHaveURL(/\/login/);
  await other.close();

  // 外观：选深色马上生效，刷新后还在；选回跟随系统就不写 data-theme
  const themeSwitch = page.getByTestId("account-theme");
  await themeSwitch.getByRole("button", { name: "深色" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "brand-dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "brand-dark");
  await expect(themeSwitch.getByRole("button", { name: "深色" })).toHaveAttribute("aria-pressed", "true");
  await themeSwitch.getByRole("button", { name: "跟随系统" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);

  // 账户页也能切语言，选的语言记到账号上（提醒邮件按它写）
  await page.getByTestId("account-lang").getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
  expect(query(`SELECT lang FROM customers WHERE email = '${newEmail}'`)).toEqual([{ lang: "en" }]);
  await page.getByTestId("account-lang").getByRole("button", { name: "中文" }).click();
  await expect(page.getByRole("heading", { name: "账户", level: 1 })).toBeVisible();

  // 用新邮箱、新密码登录
  await logout(page);
  await page.getByPlaceholder("邮箱").fill(newEmail);
  await page.getByPlaceholder("密码", { exact: true }).fill(third);
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
  await confirmOk(page);
  await expect(page.getByText("用余额开通成功")).toBeVisible();

  // 订阅页有了新订阅，余额剩 ¥5
  await page.goto("/dashboard");
  const title = page.getByTestId("sub-id").first();
  await expect(title).toBeVisible();
  const username = usernameOf(await title.innerText());
  // 卡片标题是套餐档位名（p1 是普通版），不是用户名
  await expect(page.locator(".card-title").filter({ hasText: "普通版" }).first()).toBeVisible();
  await expect(page.getByTestId("balance")).toHaveText("¥5.00");

  // 余额不够付全款：抵扣 ¥5，还要转 ¥20；管理员列表里显示的也是 ¥20
  await page.goto("/plans");
  await page.locator('button[value="p1-month"]').click();
  await confirmOk(page);
  const card = page.locator(".card.border").first();
  await expect(card).toContainText("请转账 ¥20");
  await expect(card).toContainText("已用余额抵扣 ¥5");
  const orderId = (await card.locator(".card-title").innerText()).match(/\d{6}-\d{5}/)![0];
  expect(run(["orders", "--", "list", "20"])).toContain(orderId);
  // 还没付款：余额不扣，只是被这张单占着，不能再拿去下别的单
  await expect(page.getByLabel(/用余额抵扣/)).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page.getByTestId("balance")).toHaveText("¥5.00");
  await expect(page.getByTestId("balance-reserved")).toContainText("其中 ¥5.00 抵扣在还没付款的订单上");

  // 客人取消：不再占着
  await page.goto("/plans");
  await card.getByRole("button", { name: "取消这张单" }).click();
  await confirmOk(page);
  await expect(page.locator(".card.border")).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page.getByTestId("balance")).toHaveText("¥5.00");
  await expect(page.getByTestId("balance-reserved")).toHaveCount(0);

  // 再下一单抵扣 ¥5，点「我已付款」开通后余额才扣成 ¥0
  await page.goto("/plans");
  await expect(page.getByLabel("用余额抵扣（剩 ¥5）")).toBeChecked();
  await page.locator('button[value="p1-month"]').click();
  await confirmOk(page);
  const paidCard = page.locator(".card.border").first();
  await expect(paidCard).toContainText("已用余额抵扣 ¥5");
  await paidCard.getByLabel("支付宝", { exact: true }).check();
  await paidCard.getByRole("button", { name: "我已付款" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("balance")).toHaveText("¥0.00");
  await expect(page.getByTestId("balance-reserved")).toHaveCount(0);

  // 管理员生成兑换码，客人输入后给这个订阅续期
  await page.goto("/plans");
  const code = run(["codes:create", "--", "p1-month"]).match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}/)![0];
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX").fill(code);
  await expect(page.locator('form:has(input[name="code"]) select[name="target"]')).toHaveValue(username);
  await page.getByRole("button", { name: "兑换" }).click();
  // 兑换成功直接跳到「我的订阅」，顶上写续期成功
  await expect(page).toHaveURL(/\/dashboard\?renewed=1/);
  await expect(page.getByTestId("renewed")).toContainText("续期成功");
  await expect(page.getByText(/打开客户端点击刷新按钮/)).toBeVisible();

  // 免费体验：价目表上没有，只能用兑换码开；开出来的订阅标「（体验）」
  await page.goto("/plans");
  await expect(page.locator('button[value="p3-trial"]')).toHaveCount(0);
  const trial = run(["codes:create", "--", "p3-trial"]).match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}/)![0];
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX").fill(trial);
  await page.locator('form:has(input[name="code"]) select[name="target"]').selectOption("new");
  await page.getByRole("button", { name: "兑换" }).click();
  // 新开的也直接跳到「我的订阅」，顶上写开通了什么，下面就是新订阅
  await expect(page).toHaveURL(/\/dashboard\?opened=p3-trial/);
  await expect(page.getByTestId("opened")).toContainText("开通成功：高速版 7天体验");
  await expect(page.getByRole("heading", { name: "高速版（体验）" })).toBeVisible();
  // 免费体验前几天不放续费按钮和「提前续费」
  const trialCard = page.locator(".card", { has: page.getByRole("heading", { name: "高速版（体验）" }) });
  await expect(trialCard.getByRole("link", { name: /续费/ })).toHaveCount(0);
  // 在体验上续费普通版：套餐换成普通版，标题不再是体验
  // 免费体验不记订单（不算收入），只记这个订阅的套餐
  const trialUser = query(`SELECT marzban_username FROM marzban_users WHERE plan_id = 'p3-trial' ORDER BY updated_at DESC LIMIT 1`)[0].marzban_username;
  expect(query(`SELECT COUNT(*) AS n FROM orders WHERE plan_id = 'p3-trial'`)[0].n).toBe(0);
  await page.goto("/plans");
  const upgrade = run(["codes:create", "--", "p1-month"]).match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}/)![0];
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX").fill(upgrade);
  await page.locator('form:has(input[name="code"]) select[name="target"]').selectOption(String(trialUser));
  await page.getByRole("button", { name: "兑换" }).click();
  await expect(page.getByText("续期成功")).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "高速版（体验）" })).toHaveCount(0);
});

test("管理后台：登录、确认和取消订单、客人管理、兑换码、日志", async ({ page, browser }) => {
  const stamp = Date.now();
  const customer = `e2e-admin-c-${stamp}@example.test`;
  const adminEmail = `e2e-admin-${stamp}@example.test`;
  const adminPassword = "E2eAdmin-123456";
  page.on("dialog", (d) => d.accept());

  // 管理员只能用命令建
  run(["admin:create", "--", adminEmail], `${adminPassword}\n${adminPassword}\n`);

  // 客人下三张单：第一张用支付宝付、第三张用微信付（都马上开通），第二张不付
  const claim = async (method: string, payer: string) => {
    const card = page.locator(".card.border").first();
    const id = (await card.locator(".card-title").innerText()).match(/\d{6}-\d{5}/)![0];
    await card.getByLabel(method, { exact: true }).check();
    await card.getByLabel("付款人").fill(payer);
    await card.getByRole("button", { name: "我已付款" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    return id;
  };
  await register(page, customer, "E2eTest-1234");
  await page.goto("/plans");
  await page.locator('button[value="p1-month"]').click();
  await confirmOk(page);
  const first = await claim("支付宝", "付款人甲");
  await page.goto("/plans");
  await page.locator('button[value="p1-quarter"]').click();
  await confirmOk(page);
  await expect(page.locator(".card.border")).toHaveCount(1);
  const second = (await page.locator(".card.border .card-title").first().innerText()).match(/\d{6}-\d{5}/)![0];
  await page.getByRole("radio", { name: /新开一个订阅/ }).check();
  await page.locator('button[value="p1-month"]').click();
  await confirmOk(page);
  await expect(page.locator(".card.border")).toHaveCount(2);
  const third = await claim("微信", "付款人乙");
  await expect(page.getByTestId("sub-id")).toHaveCount(2);

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

  // 第一张：已开通、待对账，看得到付款方式和付款人，确认到账
  const firstCard = admin.getByTestId("unverified-order").filter({ hasText: `订单 ${first}` });
  await expect(firstCard).toContainText("支付宝");
  await expect(firstCard).toContainText("付款人甲");
  await firstCard.getByRole("button", { name: "确认到账" }).click();
  await expect(admin.getByText(`订单 ${first} 已对账`)).toBeVisible();

  // 第三张：没收到钱，收回：新开的订阅在 Marzban 停用
  const thirdCard = admin.getByTestId("unverified-order").filter({ hasText: `订单 ${third}` });
  await expect(thirdCard).toContainText("付款人乙");
  const revokedUser = (await thirdCard.locator(".badge").innerText()).replace(/^新开\s*/, "");
  await thirdCard.getByRole("button", { name: "没收到钱，收回" }).click();
  await expect(admin.getByText(`订单 ${third} 已收回`)).toBeVisible();
  expect(((await mockMarzban("GET", `/user/${revokedUser}`)) as { status?: string }).status).toBe("disabled");

  // 第二张：取消
  const secondCard = admin.locator(".card", { hasText: `订单 ${second}` });
  await secondCard.getByRole("button", { name: "取消" }).click();
  await expect(admin.getByText(`订单 ${second} 已取消`)).toBeVisible();

  // 客人那边：第二张单不见了
  await page.goto("/dashboard");
  await expect(page.getByTestId("sub-id").first()).toBeVisible();
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
  // 生成：先点档位，再点时长；天数自动填成套餐的天数，数量用 + 加
  const create = admin.getByTestId("create-codes");
  const pickPlan = async (tier: string, period: string) => {
    await create.getByRole("group", { name: "档位" }).getByRole("button", { name: tier, exact: true }).click();
    await create.getByRole("group", { name: "时长" }).getByRole("button", { name: new RegExp(`^${period}`) }).click();
  };
  await pickPlan("普通版", "月付");
  await expect(create.getByLabel("天数", { exact: true })).toHaveValue("30");
  await create.getByRole("button", { name: "数量加一" }).click();
  await create.getByPlaceholder("比如「微信转账 张三」").fill("e2e 测试");
  await create.getByRole("button", { name: "生成 2 个「普通版 月付」" }).click();
  // 生成后两段话：短的只有兑换码，长的带注册网址和用法
  const codes = (await admin.getByTestId("code-short").locator("pre").innerText()).match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}/g)!;
  expect(codes).toHaveLength(2);
  await expect(admin.getByTestId("code-long").locator("pre")).toHaveText(new RegExp(`${codes[0]}[\\s\\S]*/register[\\s\\S]*输入兑换码`));
  await admin.locator("tr", { hasText: codes[0] }).getByRole("button", { name: "作废" }).click();
  await expect(admin.locator("tr", { hasText: codes[0] })).toContainText("已作废");

  await page.goto("/plans");
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX").fill(codes[1]);
  await page.getByRole("button", { name: "兑换" }).click();
  await expect(page.getByText("续期成功")).toBeVisible();
  await admin.reload();
  await expect(admin.locator("tr", { hasText: codes[1] })).toContainText(customer);
  await expect(admin.locator("tr", { hasText: codes[0] })).toHaveCount(0);

  // 免费体验兑换后不记订单，后台显示「已用」，不是「卡住了」
  const freeCode = run(["codes:create", "--", "p3-trial"]).match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}/)![0];
  await page.goto("/plans");
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX").fill(freeCode);
  await page.locator('form:has(input[name="code"]) select[name="target"]').selectOption("new");
  await page.getByRole("button", { name: "兑换" }).click();
  await expect(page.getByText("开通成功")).toBeVisible();
  await admin.goto(`/admin/codes?q=${freeCode}`);
  await expect(admin.locator("tr", { hasText: freeCode })).toContainText("免费体验，不记订单");
  await expect(admin.locator("tr", { hasText: freeCode })).not.toContainText("卡住了");
  await admin.goto(`/admin/codes?state=stuck&q=${freeCode}`);
  await expect(admin.locator("tr", { hasText: freeCode })).toHaveCount(0);

  // 生成时加减天数：7 天体验点三下 + 变成 10 天，客人兑换后按 10 天开通
  await admin.goto("/admin/codes");
  await pickPlan("高速版", "7天体验");
  await expect(create.getByLabel("天数", { exact: true })).toHaveValue("7");
  for (let i = 0; i < 3; i++) await create.getByRole("button", { name: "天数加一" }).click();
  await create.getByRole("button", { name: "生成 1 个「高速版 10天体验」" }).click();
  const tenDay = (await admin.getByTestId("code-short").locator("pre").innerText()).match(/[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}/)![0];
  await expect(admin.getByTestId("code-long").locator("pre")).toHaveText(/高速版 10天 支付完成，兑换码/);
  await expect(admin.locator("tr", { hasText: tenDay })).toContainText("高速版 10天体验");
  await page.goto("/plans");
  await page.getByPlaceholder("XXXX-XXXX-XXXX-XXXX").fill(tenDay);
  await page.locator('form:has(input[name="code"]) select[name="target"]').selectOption("new");
  const before10 = Math.floor(Date.now() / 1000);
  await page.getByRole("button", { name: "兑换" }).click();
  await expect(page.getByTestId("opened")).toContainText("开通成功：高速版 10天体验");
  const tenUser = String(query(`SELECT marzban_username FROM subscriptions ORDER BY id DESC LIMIT 1`)[0].marzban_username);
  const tenExpire = ((await mockMarzban("GET", `/user/${tenUser}`)) as { expire: number }).expire;
  expect(tenExpire - before10).toBeGreaterThanOrEqual(10 * 86400 - 5);
  expect(tenExpire - before10).toBeLessThan(10 * 86400 + 120);

  // 试用：首次连上才开始计时（Marzban 的 on_hold），连上后有效 3 天；详情页能看到每个节点的连接链接
  const trialUser = `e2e_trial_${stamp}`.slice(0, 32);
  await admin.goto("/admin/users/new");
  await admin.locator('input[name="username"]').fill(trialUser);
  await admin.locator('input[name="onHoldDays"]').fill("3");
  await admin.getByRole("button", { name: "新建" }).click();
  await expect(admin).toHaveURL(new RegExp(`/admin/users/${trialUser}$`));
  await expect(admin.getByText("首次连上后 3 天")).toBeVisible();
  expect(await mockMarzban("GET", `/user/${trialUser}`)).toMatchObject({ status: "on_hold", expire: null, on_hold_expire_duration: 3 * 86400 });
  await admin.getByTestId("node-links").locator("summary").click();
  await expect(admin.getByTestId("node-links").getByRole("button", { name: "复制" }).first()).toBeVisible();

    // 全部订单：按状态筛、按订单号搜，客人和订阅能点进去
  await admin.goto("/admin?view=all&status=cancelled");
  await expect(admin.getByTestId("orders-summary")).toContainText("筛出");
  for (const row of await admin.getByTestId("order-row").all()) await expect(row).toContainText("已取消");
  await admin.goto(`/admin?view=all&q=${second}`);
  await expect(admin.getByTestId("order-row")).toHaveCount(1);
  await admin.getByTestId("order-row").getByRole("link", { name: customer }).click();
  await expect(admin.getByRole("heading", { name: customer })).toBeVisible();

  // 手机上：和客人页一样是右上角的整屏菜单，顶部不放导航；点页面过去后菜单自己收起
  const customerPage = admin.url();
  await admin.setViewportSize({ width: 402, height: 874 });
  await admin.goto("/admin");
  const adminMenu = admin.getByRole("dialog", { name: "菜单" });
  await expect(adminMenu).toHaveCount(0);
  await expect(admin.getByRole("banner").getByRole("link", { name: "客人" })).toBeHidden();
  await admin.getByRole("button", { name: "打开菜单" }).click();
  for (const name of ["订单", "客人", "订阅", "兑换码", "节点", "Host", "日志", "账户"]) await expect(adminMenu.getByRole("link", { name })).toBeVisible();
  await expect(adminMenu.getByRole("button", { name: "退出" })).toBeVisible();
  await expect(adminMenu.getByRole("link", { name: "订单" })).toHaveAttribute("aria-current", "page");
  await adminMenu.getByRole("link", { name: "兑换码" }).click();
  await expect(admin).toHaveURL(/\/admin\/codes/);
  await expect(adminMenu).toHaveCount(0);
  await admin.getByRole("button", { name: "打开菜单" }).click();
  await adminMenu.getByRole("button", { name: "关闭菜单" }).click();
  await expect(adminMenu).toHaveCount(0);
  await admin.setViewportSize({ width: 1280, height: 720 });
  await admin.goto(customerPage);

  // 老订阅：微信号和这个客人一样（大小写不同也算），客人页提示一键绑定
  const legacyUser = `e2e_legacy_${stamp}`.slice(0, 32);
  await mockMarzban("POST", "/user", { username: legacyUser, expire: Math.floor(Date.now() / 1000) + 30 * 86400 });
  sql(`INSERT INTO marzban_users (marzban_username, wechat) VALUES ('${legacyUser}', 'E2E_WX_TEST')`);
  await admin.reload();
  const maybe = admin.getByTestId("maybe-subs");
  await expect(maybe).toContainText(legacyUser);
  await maybe.getByRole("button", { name: "绑定" }).click();
  // 绑完页面会刷新：这块提示跟着消失（没有待绑的了），订阅卡片出现在客人名下。不等「已绑定 ✓」，它可能来不及显示
  await expect(admin.getByTestId("customer-sub").filter({ hasText: legacyUser })).toBeVisible();
  await expect(admin.getByTestId("maybe-subs")).toHaveCount(0);
  // 按老订阅名搜能找到客人；下面老订阅表里这一行也显示「已绑定」
  await admin.goto(`/admin/customers?q=${legacyUser}&has=sub`);
  await expect(admin.getByRole("link", { name: customer }).first()).toBeVisible();
  await expect(admin.getByTestId("legacy-sub").filter({ hasText: legacyUser })).toContainText("已绑定");

    // Marzban 用户：新建（绑到客人名下）、改流量和到期、清零流量、重置链接、删除，都直接改 Marzban
  const mzUser = `e2e_mz_${stamp}`.slice(0, 32);
  await admin.goto("/admin/users");
  await expect(admin.getByText("在用 / 全部订阅")).toBeVisible();
  await admin.getByRole("link", { name: "新建订阅" }).click();
  await admin.locator('input[name="username"]').fill(mzUser);
  await admin.locator('input[name="customer"]').fill(customer);
  await admin.locator('input[name="dataGB"]').fill("50");
  // 默认每月清零、到期留空（永不到期），点「1 个月后」选上日期
  await expect(admin.locator('select[name="resetStrategy"]')).toHaveValue("month");
  await expect(admin.getByLabel("到期日期")).toHaveValue("");
  await expect(admin.getByRole("button", { name: "永不到期" })).toHaveAttribute("aria-pressed", "true");
  await admin.getByRole("button", { name: "1 个月后" }).click();
  await expect(admin.getByLabel("到期日期")).not.toHaveValue("");
  await admin.getByRole("button", { name: "新建" }).click();
  await expect(admin).toHaveURL(new RegExp(`/admin/users/${mzUser}$`));
  await expect(admin.getByText(customer)).toBeVisible();
  const createdMz = (await mockMarzban("GET", `/user/${mzUser}`)) as { data_limit?: number; expire?: number; data_limit_reset_strategy?: string };
  expect(createdMz).toMatchObject({ data_limit: 50 * 1024 ** 3, data_limit_reset_strategy: "month" });
  // 选的是 30 天后那天的 23:59（北京时间）
  expect(createdMz.expire! - Date.now() / 1000).toBeGreaterThan(29 * 86400);
  expect(createdMz.expire! - Date.now() / 1000).toBeLessThan(31 * 86400);
  // 编辑时点「永不到期」清掉到期时间
  await admin.getByRole("button", { name: "永不到期" }).click();
  await admin.getByRole("button", { name: "保存修改" }).click();
  await expect(admin.getByText("已保存到 Marzban")).toBeVisible();
  expect(((await mockMarzban("GET", `/user/${mzUser}`)) as { expire?: number | null }).expire ?? null).toBeNull();
  // 刷新掉「已保存」的提示，下一步才等得到自己那次保存
  await admin.reload();

  await admin.locator('input[name="dataGB"]').fill("");
  await admin.locator('input[name="addDays"]').fill("30");
  await admin.getByRole("button", { name: "保存修改" }).click();
  await expect(admin.getByText("已保存到 Marzban")).toBeVisible();
  expect((await mockMarzban("GET", `/user/${mzUser}`)) as { data_limit?: number | null }).toMatchObject({ data_limit: null });

  // 改套餐：Marzban 上流量和设备数按新套餐改，到期不变；客人订阅页标题变成新套餐名
  const expireBefore = ((await mockMarzban("GET", `/user/${mzUser}`)) as { expire?: number }).expire;
  // 订阅页标题旁边有订阅编号（和客人订阅页上的一样）
  await expect(admin.getByTestId("sub-id")).toHaveText(usernameCode(mzUser));
  const planCard = admin.getByTestId("plan-card");
  await expect(planCard).toContainText("没记套餐");
  await planCard.getByLabel("换成哪个套餐").selectOption("p3-month");
  await planCard.getByRole("button", { name: "改成这个套餐" }).click();
  await expect(planCard.getByText("已改成 高速版 月付")).toBeVisible();
  // 改完页面刷新出新套餐、转圈停下（线上出过：提示出来了，按钮旁边一直转圈、上面还写没记套餐）
  await expect(planCard).not.toContainText("没记套餐");
  await expect(planCard.locator(".loading")).toHaveCount(0);
  expect(await mockMarzban("GET", `/user/${mzUser}`)).toMatchObject({ data_limit: null, note: "ip=2", expire: expireBefore });
  await page.goto("/dashboard");
  await expect(page.locator(".card", { hasText: usernameCode(mzUser) }).locator(".card-title")).toHaveText("高速版");

  await admin.getByRole("button", { name: "流量清零" }).click();
  await expect(admin.getByText("流量已清零")).toBeVisible();
  await admin.getByRole("button", { name: "重置订阅链接", exact: true }).click();
  await expect(admin.getByText("订阅链接已重置")).toBeVisible();

  await admin.goto(`/admin/users?q=${mzUser}`);
  await expect(admin.getByTestId("marzban-user")).toHaveCount(1);
  // 客人和套餐是按名单一次查 D1 的（json_each），要能对上
  await expect(admin.getByTestId("marzban-user")).toContainText("高速版");
  // 用户名前的在线圆点，照 Marzban：没连过是空心，连上了是绿的「在线」
  await expect(admin.getByTestId("marzban-user").locator("[data-online]")).toHaveAttribute("data-online", "never");
  await expect(admin.getByTestId("marzban-user")).toContainText("没连过");
  await mockMarzban("PUT", `/user/${mzUser}`, { online_at: new Date().toISOString().slice(0, 19) });
  await admin.reload();
  await expect(admin.getByTestId("marzban-user").locator("[data-online]")).toHaveAttribute("data-online", "online");
  await expect(admin.getByTestId("marzban-user")).toContainText("在线");
  // 每页多少个：换成 200，网址带上 size，搜索条件还在
  await admin.getByLabel("每页多少个").selectOption("200");
  await expect(admin).toHaveURL(/size=200/);
  await expect(admin).toHaveURL(new RegExp(`q=${mzUser}`));
  await expect(admin.getByTestId("marzban-user")).toHaveCount(1);
  await admin.getByRole("link", { name: mzUser }).click();
  admin.removeAllListeners("dialog");
  admin.on("dialog", (d) => (d.type() === "prompt" ? d.accept(mzUser) : d.accept()));
  await admin.getByRole("button", { name: "删除订阅" }).click();
  await expect(admin).toHaveURL(/\/admin\/users$/);
  expect(query(`SELECT 1 FROM subscriptions WHERE marzban_username = '${mzUser}'`)).toHaveLength(0);
  admin.removeAllListeners("dialog");
  admin.on("dialog", (d) => d.accept());

  // 节点：看状态、重连出错的节点、加一个、改倍率、停用、删除；重启 Xray
  const nodeName = `e2e节点${stamp}`.slice(0, 32);
  await admin.goto("/admin/nodes");
  await expect(admin.getByText("Xray 运行中")).toBeVisible();
  const osaka = admin.getByTestId("node").filter({ hasText: "大阪" });
  await expect(osaka).toContainText("出错");
  await osaka.getByRole("button", { name: "重连" }).click();
  await expect(osaka.getByText("已发起重连")).toBeVisible();
  await admin.reload();
  await expect(admin.getByTestId("node").filter({ hasText: "大阪" })).toContainText("在线");

  const addForm = admin.locator(".card", { has: admin.getByRole("button", { name: "加节点" }) });
  await addForm.locator('input[name="name"]').fill(nodeName);
  await addForm.locator('input[name="address"]').fill("http://bad");
  await addForm.getByRole("button", { name: "加节点" }).click();
  await expect(addForm.getByText("地址要写域名或 IP")).toBeVisible();
  await addForm.locator('input[name="address"]').fill("new.example.test");
  await addForm.getByRole("button", { name: "加节点" }).click();
  await expect(addForm.getByText(`已加节点 ${nodeName}`)).toBeVisible();
  await addForm.getByRole("button", { name: "加节点" }).click();
  await expect(addForm.getByText(`已经有叫 ${nodeName} 的节点了`)).toBeVisible();

  await admin.reload();
  const mine = admin.getByTestId("node").filter({ hasText: nodeName });
  await mine.getByRole("button", { name: "修改" }).click();
  await mine.locator('input[name="coefficient"]').fill("0.5");
  await mine.getByRole("button", { name: "保存" }).click();
  await expect(mine.getByText("已保存")).toBeVisible();
  await expect(mine).toContainText("倍率 0.5");
  await mine.getByRole("button", { name: "停用" }).click();
  await expect(mine).toContainText("已停用");
  admin.removeAllListeners("dialog");
  admin.on("dialog", (d) => (d.type() === "prompt" ? d.accept(nodeName) : d.accept()));
  await mine.getByRole("button", { name: "删除" }).click();
  await expect(admin.getByTestId("node").filter({ hasText: nodeName })).toHaveCount(0);
  admin.removeAllListeners("dialog");
  admin.on("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "重启 Xray" }).click();
  await expect(admin.getByText("Xray 已重启")).toBeVisible();

  // 首页总览：一排数字，待处理订单能点进去
  await admin.goto("/admin");
  await expect(admin.getByTestId("overview")).toContainText("本月成交");
  await expect(admin.getByTestId("overview")).toContainText("出错的节点");

  // 批量：建一个到期 100 天的用户，先预览再删；全部流量清零
  const oldMz = `e2e_old_${stamp}`.slice(0, 32);
  await mockMarzban("POST", "/user", { username: oldMz, expire: Math.floor(Date.now() / 1000) - 100 * 86400 });
  await admin.goto("/admin/users");
  await admin.getByLabel("天数").fill("90");
  await admin.getByRole("button", { name: "先看看有哪些" }).click();
  await expect(admin.getByText(oldMz)).toBeVisible();
  const delBtn = admin.getByRole("button", { name: /^删除这 \d+ 个$/ });
  const count = (await delBtn.innerText()).match(/\d+/)![0];
  admin.removeAllListeners("dialog");
  admin.on("dialog", (d) => d.accept(d.message().includes("全部清零") ? "全部清零" : count));
  await delBtn.click();
  await expect(admin.getByText(`已删除 ${count} 个订阅`)).toBeVisible();
  await admin.getByRole("button", { name: "全部清零" }).click();
  await expect(admin.getByText("全部订阅的已用流量已清零")).toBeVisible();
  admin.removeAllListeners("dialog");
  admin.on("dialog", (d) => d.accept());

    // Host：给第一个入站改备注、加一个、填错被拦、保存；别的入站和后台不改的字段不受影响
  await admin.goto("/admin/hosts");
  const card = admin.getByTestId("inbound").filter({ hasText: "VLESS TCP REALITY" });
  await card.getByLabel("备注（节点名）").first().fill("🇯🇵 东京 {USERNAME}");
  await card.getByRole("button", { name: "加一个 Host" }).click();
  await expect(card.getByText("有没保存的改动")).toBeVisible();
  await card.getByRole("button", { name: "保存", exact: true }).click();
  await expect(card.getByText("第 2 个 Host的备注（客人看到的节点名）不能空")).toBeVisible();
  await card.getByLabel("备注（节点名）").nth(1).fill("🇯🇵 东京备用");
  await card.getByLabel("地址").nth(1).fill("jp2.example.test");
  await card.getByLabel("端口").nth(1).fill("8443");
  await card.getByRole("button", { name: "保存", exact: true }).click();
  await expect(card.getByText("已保存 VLESS TCP REALITY 的 Host")).toBeVisible();
  const savedHosts = (await mockMarzban("GET", "/hosts")) as unknown as Record<string, Record<string, unknown>[]>;
  expect(savedHosts["VLESS TCP REALITY"].map((h) => [h.remark, h.port, h.mux_enable])).toEqual([
    ["🇯🇵 东京 {USERNAME}", null, true],
    ["🇯🇵 东京备用", 8443, undefined],
  ]);
  expect(savedHosts["VLESS NODE2"]).toHaveLength(1);

    // 日志页能按操作筛
  await admin.goto("/admin/logs?action=codes.create");
  // 生成过两次：p1 月付 2 个、改成 10 天的体验 1 个
  await expect(admin.locator("tbody tr", { hasText: adminEmail })).toHaveCount(2);
  const myCodeLogs = admin.locator("tbody tr", { hasText: adminEmail });
  await expect(myCodeLogs.filter({ hasText: "2 个：e2e 测试" })).toHaveCount(1);
  await expect(myCodeLogs.filter({ hasText: "高速版 10天体验" })).toContainText("1 个");

  // 操作日志：每一步都记了（扣钱失败的那次没有改数据，不记）
  const logs = query(`SELECT action, target FROM admin_logs WHERE admin_email = '${adminEmail}' ORDER BY id`);
  expect(logs.map((l) => l.action)).toEqual([
    "login.fail",
    "login",
    "order.verify",
    "order.revoke",
    "order.cancel",
    "balance.adjust",
    "password.reset_link",
    "subscription.bind",
    "codes.create",
    "code.void",
    "codes.create",
    "user.create",
    "subscription.bind",
    "user.create",
    "user.edit",
    "user.edit",
    "user.change_plan",
    "user.reset_usage",
    "user.revoke_sub",
    "user.delete",
    "node.reconnect",
    "node.add",
    "node.edit",
    "node.disable",
    "node.delete",
    "core.restart",
    "users.delete_expired",
    "users.reset_all_usage",
    "hosts.save",
  ]);

  // ⌘K 全局搜索：搜客人邮箱，回车跳到客人详情；不输字时能当页面跳转用
  await admin.goto("/admin");
  await admin.keyboard.press("ControlOrMeta+k");
  const palette = admin.getByRole("dialog", { name: "全局搜索" });
  await expect(palette.getByTestId("search-results")).toContainText("我的账户");
  await palette.getByLabel("搜索内容").fill(customer);
  await expect(palette.getByTestId("search-results")).toContainText("客人");
  await expect(palette.getByRole("option").first()).toContainText(customer);
  await admin.keyboard.press("Enter");
  await expect(admin).toHaveURL(/\/admin\/customers\/\d+$/);
  await admin.getByRole("button", { name: "搜索" }).click();
  await palette.getByLabel("搜索内容").fill(first);
  await expect(palette.getByTestId("search-results")).toContainText(`订单 ${first}`);

  // 我的账户：点右上角「账户」进去；偏好、登录中的设备、改密码、我的操作
  await admin.goto("/admin");
  await admin.getByRole("link", { name: "账户", exact: true }).click();
  await expect(admin).toHaveURL(/\/admin\/account/);
  await expect(admin.getByTestId("admin-theme").getByRole("button", { name: "深色" })).toBeVisible();
  await expect(admin.getByTestId("admin-profile")).toContainText(adminEmail);
  await expect(admin.getByRole("link", { name: "账户", exact: true })).toHaveAttribute("aria-current", "page");
  // 后台页脚不放给客人的链接和联系客服
  await expect(admin.locator("footer").getByRole("link", { name: "购买套餐" })).toHaveCount(0);
  await expect(admin.locator("footer").getByText("联系客服")).toHaveCount(0);
  // 偏好：每页 10 个、快到期的在前、具体日期 → 订阅列表打开就是这样
  const prefsCard = admin.getByTestId("admin-prefs");
  await prefsCard.getByLabel("订阅列表每页").selectOption("10");
  await prefsCard.getByLabel("订阅列表默认排序").selectOption("expire");
  await prefsCard.getByLabel("到期时间显示成").selectOption("absolute");
  await prefsCard.getByRole("button", { name: "保存偏好" }).click();
  await expect(prefsCard.getByText("已保存")).toBeVisible();
  await admin.goto("/admin/users");
  await expect(admin.getByLabel("每页多少个")).toHaveValue("10");
  await expect(admin.locator('select[name="sort"]')).toHaveValue("expire");
  expect(await admin.getByTestId("marzban-user").count()).toBeLessThanOrEqual(10);
  await expect(admin.getByTestId("marzban-user").first()).toContainText(/\d{4}\/\d{2}\/\d{2}|永不到期/);
  // 同一个管理员在另一台设备也登录着：列出来，退出其他设备后那边要重新登录
  const ctx2 = await browser.newContext();
  const admin2 = await ctx2.newPage();
  await admin2.goto("/admin/login");
  await admin2.getByPlaceholder("管理员邮箱").fill(adminEmail);
  await admin2.getByPlaceholder("密码").fill(adminPassword);
  await admin2.getByRole("button", { name: "登录" }).click();
  await expect(admin2).toHaveURL(/\/admin$/);
  await admin.goto("/admin/account");
  const sessionsCard = admin.getByTestId("admin-sessions");
  await expect(sessionsCard.getByText("这台设备")).toBeVisible();
  await sessionsCard.getByRole("button", { name: /退出其他 \d+ 台设备/ }).click();
  await confirmOk(admin);
  await expect(sessionsCard.getByText(/已退出 \d+ 个登录/)).toBeVisible();
  await admin2.goto("/admin");
  await expect(admin2).toHaveURL(/\/admin\/login/);
  await ctx2.close();
  // 改密码：当前密码不对不让改；对了就改，用新密码能登录
  const newPassword = "E2eAdmin-654321";
  await admin.getByLabel("当前密码").fill("wrong-password-123");
  await admin.getByLabel("新密码", { exact: true }).fill(newPassword);
  await admin.getByLabel("再输一次新密码").fill(newPassword);
  await admin.getByRole("button", { name: "改密码" }).click();
  await expect(admin.getByText("当前密码不对")).toBeVisible();
  // 提交后表单会清空，重新填
  await admin.getByLabel("当前密码").fill(adminPassword);
  await admin.getByLabel("新密码", { exact: true }).fill(newPassword);
  await admin.getByLabel("再输一次新密码").fill(newPassword);
  await admin.getByRole("button", { name: "改密码" }).click();
  await expect(admin.getByText(/^密码已修改/)).toBeVisible();
  await expect(admin.getByTestId("admin-my-logs")).toContainText("改后台偏好");
  await expect(admin.getByTestId("admin-my-logs")).toContainText("改自己的密码");

  // 退出后回到登录页，新密码能登录
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "退出" }).click();
  await expect(admin).toHaveURL(/\/admin\/login/);
  await admin.getByPlaceholder("管理员邮箱").fill(adminEmail);
  await admin.getByPlaceholder("密码").fill(newPassword);
  await admin.getByRole("button", { name: "登录" }).click();
  await expect(admin).toHaveURL(/\/admin$/);
  await ctx.close();
});
