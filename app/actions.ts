"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, nowSec } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession, requireCustomer } from "@/lib/session";
import { lookupSubscription, revokeSubscription } from "@/lib/marzban";
import { formatExpire, newReferralCode, normalizeRedeemCode, normalizeReferralCode, parseSubToken } from "@/lib/format";
import { findPlan } from "@/lib/plans";
import { type ProvisionResult } from "@/lib/provision";
import { provisionTarget } from "@/lib/orders";
import { confirmTransferOrder, orderLabel } from "@/lib/admin-orders";
import { site } from "@/site.config";
import { BALANCE_SQL } from "@/lib/balance";
import { canSendMail, sendMail } from "@/lib/mail";
import { hashResetToken, newResetToken, RESET_MAX_PER_HOUR, RESET_TTL_SELF, resetLink } from "@/lib/reset";

// email：出错时带回去当输入框的默认值。React 19 提交后会重置表单，不带回去邮箱就被清空了
export type FormState = { error?: string; ok?: string; email?: string; ref?: string; wechat?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 微信号是 6–20 位字母、数字、下划线、减号；没设微信号的人会填绑定的手机号（11 位数字），也能搜到
const WECHAT_RE = /^[A-Za-z0-9_-]{5,30}$/;

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const wechat = String(form.get("wechat") ?? "").trim();
  const refInput = String(form.get("ref") ?? "").trim();
  const back = { email, ref: refInput, wechat };
  if (!EMAIL_RE.test(email)) return { error: "邮箱格式不对", ...back };
  if (password.length < 8) return { error: "密码至少 8 位", ...back };
  if (!wechat) return { error: "请填微信号，方便客服联系你", ...back };
  if (!WECHAT_RE.test(wechat)) return { error: "微信号格式不对：只能是字母、数字、下划线或减号，也可以填微信绑定的手机号", ...back };

  // 推荐码可以不填；填了就必须是真的，免得客人以为填上了其实没记到
  const code = normalizeReferralCode(refInput);
  let referrer: number | null = null;
  if (code === null) return { error: "推荐码格式不对，是 8 位字母和数字", ...back };
  if (code) {
    const r = await db().prepare("SELECT id FROM customers WHERE referral_code = ?").bind(code).first<{ id: number }>();
    if (!r) return { error: "没有这个推荐码，请找朋友再确认一下，或者留空", ...back };
    referrer = r.id;
  }

  const exists = await db().prepare("SELECT 1 FROM customers WHERE email = ?").bind(email).first();
  if (exists) return { error: "这个邮箱已经注册过了，直接登录吧", ...back };

  const row = await db()
    .prepare(
      `INSERT INTO customers (email, password_hash, wechat, referral_code, referred_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(email, await hashPassword(password), wechat, newReferralCode(), referrer, nowSec())
    .first<{ id: number }>();
  await createSession(row!.id);
  redirect("/dashboard");
}

// 15 分钟内同一邮箱错 5 次、或同一 IP 错 20 次，就暂停登录
const FAIL_WINDOW = 15 * 60;
const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 20;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = (await headers()).get("cf-connecting-ip") ?? "local";
  const since = nowSec() - FAIL_WINDOW;

  const fails = await db()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM login_failures WHERE email = ?1 AND at > ?3) AS by_email,
         (SELECT COUNT(*) FROM login_failures WHERE ip = ?2 AND at > ?3) AS by_ip`,
    )
    .bind(email, ip, since)
    .first<{ by_email: number; by_ip: number }>();
  if (fails && (fails.by_email >= MAX_FAILS_PER_EMAIL || fails.by_ip >= MAX_FAILS_PER_IP)) {
    return { error: "密码错误次数太多，请 15 分钟后再试", email };
  }

  const c = await db()
    .prepare("SELECT id, password_hash FROM customers WHERE email = ?")
    .bind(email)
    .first<{ id: number; password_hash: string }>();
  // 邮箱不存在和密码错误给同一个提示，不让人试探哪些邮箱注册过
  if (!c || !(await verifyPassword(password, c.password_hash))) {
    // 顺手删掉过期的记录，表不会越来越大
    await db().batch([
      db().prepare("INSERT INTO login_failures (email, ip, at) VALUES (?, ?, ?)").bind(email, ip, nowSec()),
      db().prepare("DELETE FROM login_failures WHERE at <= ?").bind(since),
    ]);
    return { error: "邮箱或密码不对", email };
  }
  await db().prepare("DELETE FROM login_failures WHERE email = ?").bind(email).run();
  await createSession(c.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function bindSubscription(_: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const token = parseSubToken(String(form.get("link") ?? ""));
  if (!token) return { error: "这不像订阅链接。完整的链接里应该有 /sub/" };

  const info = await lookupSubscription(token);
  if (!info) return { error: "找不到这个订阅。链接可能已经重置过，请联系客服要新的" };

  const owner = await db()
    .prepare("SELECT customer_id FROM subscriptions WHERE marzban_username = ?")
    .bind(info.username)
    .first<{ customer_id: number }>();
  if (owner?.customer_id === customer.id) return { ok: "这个订阅已经在你的账号下了" };
  if (owner) return { error: "这个订阅已经绑定在别的账号上了，请联系客服" };

  await db()
    .prepare("INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (?, ?, ?)")
    .bind(customer.id, info.username, nowSec())
    .run();
  revalidatePath("/dashboard");
  return { ok: "绑定成功" };
}

export async function resetSubscriptionLink(form: FormData) {
  const customer = await requireCustomer();
  const username = String(form.get("username") ?? "");
  // 只能重置自己名下的订阅
  const mine = await db()
    .prepare("SELECT 1 FROM subscriptions WHERE customer_id = ? AND marzban_username = ?")
    .bind(customer.id, username)
    .first();
  if (!mine) return;
  await revokeSubscription(username);
  revalidatePath("/dashboard");
}

// 用兑换码买套餐：target 是 "new"（新开一个订阅）或者客人名下某个订阅的用户名（续期）。
// 顺序：先占住兑换码 → 改 Marzban → 记账。
// 只有确认 Marzban 什么都没改时才放回兑换码；Marzban 可能已经改了就保留兑换码，交给管理员核对，
// 免得客人重试时多开一个用户或者多续一次期
export async function redeem(_: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const code = normalizeRedeemCode(String(form.get("code") ?? ""));
  const target = String(form.get("target") ?? "new");
  if (!code) return { error: "兑换码格式不对，是 16 位字母和数字" };

  const row = await db()
    .prepare("SELECT plan_id, used_by FROM redeem_codes WHERE code = ?")
    .bind(code)
    .first<{ plan_id: string; used_by: number | null }>();
  if (!row) return { error: "没有这个兑换码，请检查有没有输错" };
  if (row.used_by !== null) return { error: "这个兑换码已经用过了" };
  const plan = findPlan(site.plans, row.plan_id);
  if (!plan) return { error: "这个兑换码对应的套餐已经下架了，请联系客服" };

  const { results } = await db()
    .prepare("SELECT marzban_username FROM subscriptions WHERE customer_id = ? ORDER BY id")
    .bind(customer.id)
    .all<{ marzban_username: string }>();
  const subs = results.map((r) => r.marzban_username);
  if (target !== "new" && !subs.includes(target)) return { error: "请选择要续期的订阅" };

  // 两个请求同时用同一个兑换码时，只有一个能占到
  const now = nowSec();
  const claim = await db()
    .prepare("UPDATE redeem_codes SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL")
    .bind(customer.id, now, code)
    .run();
  if (claim.meta.changes !== 1) return { error: "这个兑换码已经用过了" };
  const release = () =>
    db().prepare("UPDATE redeem_codes SET used_by = NULL, used_at = NULL WHERE code = ?").bind(code).run();

  // 写 Marzban 之前出错，Marzban 还没动过，放回兑换码就行
  let result: ProvisionResult;
  try {
    const r = await provisionTarget(customer.id, subs, target, plan, now);
    if ("error" in r) {
      await release();
      return { error: r.error };
    }
    result = r;
  } catch (e) {
    console.error("redeem: 写 Marzban 之前出错", e);
    await release();
    return { error: "开通失败，兑换码没有被用掉，请稍后再试。一直失败的话请联系客服" };
  }

  if (result.kind === "retry") {
    console.error(`redeem: ${result.reason}`);
    await release();
    return { error: "开通失败，兑换码没有被用掉，请稍后再试。一直失败的话请联系客服" };
  }
  if (result.kind === "stuck") {
    // 兑换码保持占用（used_by 有值、order_id 为空），管理员按日志去 Marzban 核对
    console.error(`redeem: 需要人工核对 customer=${customer.id} code=${code} plan=${plan.id} ${result.reason}`);
    return {
      error: `开通的时候出了点问题，兑换码已经帮你保留，不会作废。请不要重复兑换，把这句话截图发给管理员处理（${result.username}）`,
    };
  }
  if (result.warning) {
    console.error(`redeem: customer=${customer.id} user=${result.username} ${result.warning}`);
  }
  const username = result.username;
  const expire = result.expire;

  // 记账会触发推荐奖励（按套餐价）。last_insert_rowid() 在同一个 batch 里指向刚插入的订单
  try {
    await db().batch([
      ...(target === "new"
        ? [
            db()
              .prepare("INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (?, ?, ?)")
              .bind(customer.id, username, now),
          ]
        : []),
      db()
        .prepare(
          `INSERT INTO orders (customer_id, amount, method, status, plan_id, marzban_username, paid_at, created_at)
         VALUES (?, ?, 'redeem_code', 'paid', ?, ?, ?, ?)`,
        )
        .bind(customer.id, plan.price, plan.id, username, now, now),
      db().prepare("UPDATE redeem_codes SET order_id = last_insert_rowid() WHERE code = ?").bind(code),
    ]);
  } catch (e) {
    // Marzban 已经开好了，兑换码也占住了，只差记账：让管理员按日志补
    console.error(`redeem: 写库失败 customer=${customer.id} user=${username} plan=${plan.id}`, e);
    return { error: `已经开通（${username}），但保存记录时出错了，请把这句话截图发给管理员处理` };
  }
  revalidatePath("/dashboard");
  revalidatePath("/plans");
  return {
    ok:
      `${target === "new" ? "开通" : "续期"}成功：${plan.name}，${username} 到期时间 ${formatExpire(expire)}。回到「我的订阅」就能导入使用` +
      (result.warning ? "。已用流量还没清零，管理员会帮你处理" : ""),
  };
}

// 同一个客人最多同时挂几张没处理完的单，免得有人乱点堆一堆单
const MAX_OPEN_ORDERS = 3;

// 在套餐页下单：建一张待付款的单（金额按现在的套餐价锁定）。客人转账时备注订单号，管理员确认收款后才开通。
// target 和兑换码一样："new" 或者客人名下某个订阅的用户名（续期）
// useBalance=1：用余额抵扣。余额够付全款就直接扣余额开通（buyWithBalance），不够就抵扣一部分、剩下的转账
export async function createOrder(prev: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const plan = findPlan(site.plans, String(form.get("plan") ?? ""));
  if (!plan) return { error: "这个套餐已经下架了，请刷新页面再选" };
  const balanceRow = await db().prepare(BALANCE_SQL).bind(customer.id).first<{ balance: number }>();
  const balance = form.get("useBalance") === "1" ? Math.max(0, balanceRow?.balance ?? 0) : 0;
  if (balance >= plan.price) return buyWithBalance(prev, form);
  if (site.payments.length === 0) return { error: balance > 0 ? "余额不够付这个套餐" : "现在还不能在线下单，请用兑换码" };
  const target = String(form.get("target") ?? "new");
  if (target !== "new") {
    const mine = await db()
      .prepare("SELECT 1 FROM subscriptions WHERE customer_id = ? AND marzban_username = ?")
      .bind(customer.id, target)
      .first();
    if (!mine) return { error: "请选择要续期的订阅" };
  }

  const open = await db()
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ? AND status IN ('pending', 'processing')")
    .bind(customer.id)
    .first<{ n: number }>();
  if ((open?.n ?? 0) >= MAX_OPEN_ORDERS) return { error: "你还有没付款的单，先付款或者取消不要的单再下新的" };

  // 抵扣：先建单（记下用了多少余额），再用带条件的 INSERT 扣余额；余额刚好变了扣不了，就删掉这张单让客人重来
  const now = nowSec();
  const order = await db()
    .prepare(
      `INSERT INTO orders (customer_id, amount, balance_used, method, status, plan_id, marzban_username, created_at)
       VALUES (?, ?, ?, 'transfer', 'pending', ?, ?, ?) RETURNING id`,
    )
    .bind(customer.id, plan.price, balance, plan.id, target === "new" ? null : target, now)
    .first<{ id: number }>();
  if (balance > 0) {
    const charge = await db()
      .prepare(
        `INSERT INTO balance_entries (customer_id, amount, kind, order_id, created_at)
         SELECT ?1, -?2, 'purchase', ?3, ?4
         WHERE (SELECT COALESCE(SUM(amount), 0) FROM balance_entries WHERE customer_id = ?1) >= ?2`,
      )
      .bind(customer.id, balance, order!.id, now)
      .run();
    if (charge.meta.changes !== 1) {
      await db().prepare("DELETE FROM orders WHERE id = ?").bind(order!.id).run();
      return { error: "余额刚刚变了，请刷新页面再下单" };
    }
  }
  revalidatePath("/plans");
  revalidatePath("/dashboard");
  return { ok: "下单成功，请按上面的说明付款" };
}

// 客人取消自己还没付款的单，下单时抵扣的余额退回。点过「我已付款」的、管理员已经在开通的（processing）都不能取消，免得付了钱又把单取消掉
export async function cancelOrder(form: FormData) {
  const customer = await requireCustomer();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const r = await db()
    .prepare(
      "UPDATE orders SET status = 'cancelled' WHERE id = ? AND customer_id = ? AND status = 'pending' AND claimed_at IS NULL",
    )
    .bind(id, customer.id)
    .run();
  // 下单时抵扣的余额退回
  if (r.meta.changes === 1) {
    await db().prepare("DELETE FROM balance_entries WHERE order_id = ? AND kind = 'purchase'").bind(id).run();
  }
  revalidatePath("/plans");
  revalidatePath("/dashboard");
}

// 客人付完款点「我已付款」：记下时间、付款方式、付款人（管理员对账用），然后马上开通，不等管理员核对（先开通后对账）。
// 点过一次就不再改时间。自动开通没成功的，单留在「客人说已付」，管理员在后台手动开通
export async function claimPaid(_: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: "订单号不对，请刷新页面" };
  const method = String(form.get("payMethod") ?? "");
  if (!site.payments.some((p) => p.name === method)) return { error: "请选择你是用哪个付的款" };
  const payer = String(form.get("payer") ?? "").trim().slice(0, 40) || null;
  const r = await db()
    .prepare(
      `UPDATE orders SET claimed_at = ?, pay_method = ?, payer = ?
       WHERE id = ? AND customer_id = ? AND status = 'pending' AND claimed_at IS NULL`,
    )
    .bind(nowSec(), method, payer, id, customer.id)
    .run();
  if (r.meta.changes !== 1) return { error: "这张单已经处理过了，请刷新页面" };

  const result = await confirmTransferOrder(id, { customerId: customer.id });
  revalidatePath("/plans");
  revalidatePath("/dashboard");
  if ("error" in result) {
    console.error(`claimPaid: 自动开通失败 order=${id} customer=${customer.id} ${result.error}`);
    return { error: "已经记下你付了款，但自动开通没成功。管理员会尽快帮你开通，不用重新下单" };
  }
  // 开通好了，直接去「我的订阅」拿订阅
  redirect("/dashboard");
}

// 忘记密码：给这个邮箱发一封带重置链接的邮件。不管邮箱有没有注册过都给同样的提示，不让人试探哪些邮箱注册过
export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "邮箱格式不对", email };
  if (!canSendMail()) return { error: "现在还不能自动发邮件，请联系客服帮你重置密码", email };
  const done = { ok: `如果 ${email} 注册过，重置链接已经发过去了，1 小时内有效。没收到的话看看垃圾邮件。` };

  const c = await db().prepare("SELECT id FROM customers WHERE email = ?").bind(email).first<{ id: number }>();
  if (!c) return done;
  const now = nowSec();
  const recent = await db()
    .prepare("SELECT COUNT(*) AS n FROM password_resets WHERE customer_id = ? AND created_at > ?")
    .bind(c.id, now - 3600)
    .first<{ n: number }>();
  // 次数超了也给同样的提示，只是不再发
  if ((recent?.n ?? 0) >= RESET_MAX_PER_HOUR) return done;

  const token = newResetToken();
  await db()
    .prepare("INSERT INTO password_resets (token_hash, customer_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await hashResetToken(token), c.id, now + RESET_TTL_SELF, now)
    .run();
  const sent = await sendMail(
    email,
    `${site.brand} 重置密码`,
    `你好，\n\n有人（希望是你）申请重置 ${site.brand} 账号 ${email} 的密码。打开下面的链接设置新密码，1 小时内有效，只能用一次：\n\n${resetLink(site.siteUrl, token)}\n\n如果不是你申请的，不用理会这封邮件，密码不会改变。`,
  );
  if (!sent) return { error: "邮件没发出去，请稍后再试，或者联系客服帮你重置", email };
  return done;
}

// 用重置链接设置新密码。成功后：链接作废、这个账号的其他重置链接也作废、所有设备上的登录都退出（防止是密码泄露了），
// 然后直接在当前设备登录
export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "密码至少 8 位" };
  if (password !== String(form.get("confirm") ?? "")) return { error: "两次输入的密码不一样" };

  const hash = await hashResetToken(token);
  const now = nowSec();
  const r = await db()
    .prepare(
      `SELECT r.customer_id, c.email FROM password_resets r JOIN customers c ON c.id = r.customer_id
       WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ?`,
    )
    .bind(hash, now)
    .first<{ customer_id: number; email: string }>();
  if (!r) return { error: "这个链接已经失效了（用过了或者过期了），请重新申请" };

  // 两个请求同时用同一个链接时，只有一个能占到
  const claim = await db()
    .prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL")
    .bind(now, hash)
    .run();
  if (claim.meta.changes !== 1) return { error: "这个链接已经失效了（用过了或者过期了），请重新申请" };

  await db().batch([
    db().prepare("UPDATE customers SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), r.customer_id),
    db().prepare("UPDATE password_resets SET used_at = ? WHERE customer_id = ? AND used_at IS NULL").bind(now, r.customer_id),
    db().prepare("DELETE FROM sessions WHERE customer_id = ?").bind(r.customer_id),
    db().prepare("DELETE FROM login_failures WHERE email = ?").bind(r.email),
  ]);
  await createSession(r.customer_id);
  redirect("/dashboard");
}

// 用余额买套餐：余额够就马上开通，不用管理员确认。target 和兑换码一样："new" 或客人名下某个订阅的用户名。
// 顺序：先建一张「开通中」的单 → 扣余额（余额不够就扣不了）→ 改 Marzban → 记成已付款（触发推荐奖励）。
// Marzban 确认没改就退回余额；可能改了就不退，单停在「开通中」，管理员用 npm run orders -- confirm 核对
export async function buyWithBalance(_: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const plan = findPlan(site.plans, String(form.get("plan") ?? ""));
  if (!plan) return { error: "这个套餐已经下架了，请刷新页面再选" };
  const target = String(form.get("target") ?? "new");
  const { results } = await db()
    .prepare("SELECT marzban_username FROM subscriptions WHERE customer_id = ? ORDER BY id")
    .bind(customer.id)
    .all<{ marzban_username: string }>();
  const subs = results.map((r) => r.marzban_username);
  if (target !== "new" && !subs.includes(target)) return { error: "请选择要续期的订阅" };

  const now = nowSec();
  const order = await db()
    .prepare(
      `INSERT INTO orders (customer_id, amount, balance_used, method, status, plan_id, marzban_username, created_at)
       VALUES (?, ?, ?, 'balance', 'processing', ?, ?, ?) RETURNING id`,
    )
    .bind(customer.id, plan.price, plan.price, plan.id, target === "new" ? null : target, now)
    .first<{ id: number }>();
  const orderId = order!.id;
  // 扣款是一条带条件的 INSERT：余额不够就插不进去。两个请求同时买，也不会把余额扣成负数
  const charge = await db()
    .prepare(
      `INSERT INTO balance_entries (customer_id, amount, kind, order_id, created_at)
       SELECT ?1, -?2, 'purchase', ?3, ?4
       WHERE (SELECT COALESCE(SUM(amount), 0) FROM balance_entries WHERE customer_id = ?1) >= ?2`,
    )
    .bind(customer.id, plan.price, orderId, now)
    .run();
  if (charge.meta.changes !== 1) {
    await db().prepare("DELETE FROM orders WHERE id = ?").bind(orderId).run();
    return { error: "余额不够买这个套餐" };
  }
  // Marzban 没动过时用：删掉这笔扣款，单记成已取消
  const refund = () =>
    db().batch([
      db().prepare("DELETE FROM balance_entries WHERE order_id = ? AND kind = 'purchase'").bind(orderId),
      db().prepare("UPDATE orders SET status = 'cancelled', note = '开通失败，余额已退回' WHERE id = ?").bind(orderId),
    ]);
  const failed = { error: "开通失败，余额已经退回，请稍后再试。一直失败的话请联系客服" };

  let result: ProvisionResult;
  try {
    const r = await provisionTarget(customer.id, subs, target, plan, now);
    if ("error" in r) {
      await refund();
      return { error: `${r.error}（余额没有扣）` };
    }
    result = r;
  } catch (e) {
    console.error(`buyWithBalance: 写 Marzban 之前出错 order=${orderId}`, e);
    await refund();
    return failed;
  }
  if (result.kind === "retry") {
    console.error(`buyWithBalance: order=${orderId} ${result.reason}`);
    await refund();
    return failed;
  }
  if (result.kind === "stuck") {
    console.error(`buyWithBalance: 需要人工核对 order=${orderId} customer=${customer.id} plan=${plan.id} ${result.reason}`);
    return {
      error: `开通的时候出了点问题，余额已经扣了，不会丢。请不要重复购买，把这句话截图发给管理员处理（${await orderLabel(orderId)}，${result.username}）`,
    };
  }
  if (result.warning) console.error(`buyWithBalance: order=${orderId} user=${result.username} ${result.warning}`);
  const username = result.username;

  try {
    await db().batch([
      ...(target === "new"
        ? [
            db()
              .prepare("INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (?, ?, ?)")
              .bind(customer.id, username, now),
          ]
        : []),
      db()
        .prepare("UPDATE orders SET status = 'paid', paid_at = ?, marzban_username = ? WHERE id = ?")
        .bind(now, username, orderId),
    ]);
  } catch (e) {
    console.error(`buyWithBalance: 写库失败 order=${orderId} user=${username}`, e);
    return { error: `已经开通（${username}），但保存记录时出错了，请把这句话截图发给管理员处理（${await orderLabel(orderId)}）` };
  }
  revalidatePath("/dashboard");
  revalidatePath("/plans");
  return {
    ok:
      `用余额${target === "new" ? "开通" : "续期"}成功：${plan.name}，${username} 到期时间 ${formatExpire(result.expire)}。回到「我的订阅」就能导入使用` +
      (result.warning ? "。已用流量还没清零，管理员会帮你处理" : ""),
  };
}

