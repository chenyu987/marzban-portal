"use server";

import { withCodeDays } from "@/lib/redeem-codes";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, nowSec } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, currentCustomer, destroyOtherSessions, destroySession, requireCustomer } from "@/lib/session";
import { findUser, lookupSubscription, revokeSubscription } from "@/lib/marzban";
import { formatExpire, formatMoney, isExpiredSub, newReferralCode, normalizeRedeemCode, normalizeReferralCode, parseSubToken } from "@/lib/format";
import { findPlan, forSale } from "@/lib/plans";
import { type ProvisionResult } from "@/lib/provision";
import { provisionTarget } from "@/lib/orders";
import { confirmTransferOrder, orderLabel } from "@/lib/admin-orders";
import { site } from "@/site.config";
import { RENEW_REFRESH_HINT } from "@/lib/clients";
import { AVAILABLE_SQL, LEDGER_SQL, RESERVED_SQL } from "@/lib/balance";
import { canSendMail, sendMail } from "@/lib/mail";
import { notifyClaimedOrder } from "@/lib/admin-alerts";
import { hashResetToken, newResetToken, RESET_MAX_PER_HOUR, RESET_TTL_SELF, resetLink } from "@/lib/reset";
import { getT } from "@/lib/lang";
import { planName } from "@/lib/plan-text";
import { LANG_COOKIE, makeT, parseLang, pick, type Lang } from "@/lib/i18n";

// email：出错时带回去当输入框的默认值。React 19 提交后会重置表单，不带回去邮箱就被清空了。
// support：提示里让客人找客服，页面在提示下面放「复制客服微信 / 邮箱」按钮
export type FormState = { error?: string; ok?: string; email?: string; ref?: string; wechat?: string; support?: boolean; orderId?: number } | undefined;

import { emailError, passwordError, wechatError } from "@/lib/account";
import { claimByWechat, followWechatChange } from "@/lib/claim";
import { mailGreeting, mailSupportLine } from "@/lib/mail-text";
import { KEEP_SECONDS, overLimit, recordHit, REDEEM_FAIL_LIMITS, REGISTER_LIMITS, RESET_IP_LIMITS } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const wechat = String(form.get("wechat") ?? "").trim();
  const refInput = String(form.get("ref") ?? "").trim();
  const back = { email, ref: refInput, wechat };
  const { t, lang } = await getT();
  const invalid = emailError(email, lang) ?? passwordError(password, lang) ?? wechatError(wechat, lang);
  if (invalid) return { error: invalid, ...back };
  // 防机器人：先过人机验证，再看这个 IP 最近注册了几个
  const ip = (await headers()).get("cf-connecting-ip") ?? "local";
  if (!(await verifyTurnstile(form, ip))) return { error: t("人机验证没通过，请再点一下验证框后重试", "Human verification failed. Please complete the check and try again"), ...back };
  if (await overLimit("register", ip, REGISTER_LIMITS))
    return { error: t("这个网络最近注册的账号太多了，请过一会儿再试，或者联系客服", "Too many accounts were created from this network recently. Please try again later or contact support"), ...back, support: true };

  // 推荐码可以不填；填了就必须是真的，免得客人以为填上了其实没记到
  const code = normalizeReferralCode(refInput);
  let referrer: number | null = null;
  if (code === null) return { error: t("推荐码格式不对，是 8 位字母和数字", "Invalid referral code: it's 8 letters and numbers"), ...back };
  if (code) {
    const r = await db().prepare("SELECT id FROM customers WHERE referral_code = ?").bind(code).first<{ id: number }>();
    if (!r) return { error: t("没有这个推荐码，请找朋友再确认一下，或者留空", "That referral code doesn't exist. Check with your friend, or leave it blank"), ...back };
    referrer = r.id;
  }

  const exists = await db().prepare("SELECT 1 FROM customers WHERE email = ?").bind(email).first();
  if (exists) return { error: t("这个邮箱已经注册过了，直接登录吧", "This email is already registered. Please log in"), ...back };

  const row = await db()
    .prepare(
      `INSERT INTO customers (email, password_hash, wechat, referral_code, referred_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(email, await hashPassword(password), wechat, newReferralCode(), referrer, nowSec())
    .first<{ id: number }>();
  await recordHit("register", ip);
  // 管理员之前按这个微信号开过的订阅，直接绑过来，「我的订阅」里就能看到
  await claimByWechat({ id: row!.id, email }, wechat);
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
  const { t } = await getT();

  const fails = await db()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM login_failures WHERE email = ?1 AND at > ?3) AS by_email,
         (SELECT COUNT(*) FROM login_failures WHERE ip = ?2 AND at > ?3) AS by_ip`,
    )
    .bind(email, ip, since)
    .first<{ by_email: number; by_ip: number }>();
  if (fails && (fails.by_email >= MAX_FAILS_PER_EMAIL || fails.by_ip >= MAX_FAILS_PER_IP)) {
    return { error: t("密码错误次数太多，请 15 分钟后再试", "Too many wrong attempts. Please try again in 15 minutes"), email };
  }

  const c = await db()
    .prepare("SELECT id, password_hash FROM customers WHERE email = ?")
    .bind(email)
    .first<{ id: number; password_hash: string }>();
  // 邮箱不存在和密码错误给同一个提示，不让人试探哪些邮箱注册过
  if (!c || !(await verifyPassword(password, c.password_hash))) {
    // 顺手删掉过期的记录，表不会越来越大。防机器人的次数（lib/rate-limit.ts）也记在这张表里、要留一天，所以删一天以前的
    await db().batch([
      db().prepare("INSERT INTO login_failures (email, ip, at) VALUES (?, ?, ?)").bind(email, ip, nowSec()),
      db().prepare("DELETE FROM login_failures WHERE at <= ?").bind(nowSec() - KEEP_SECONDS),
    ]);
    return { error: t("邮箱或密码不对", "Wrong email or password"), email };
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
  const { t } = await getT();
  const token = parseSubToken(String(form.get("link") ?? ""));
  if (!token) return { error: t("这不像订阅链接。完整的链接里应该有 /sub/", "That doesn't look like a subscription link. A full link contains /sub/") };

  const info = await lookupSubscription(token);
  if (!info) return { error: t("找不到这个订阅。链接可能已经重置过，请联系客服要新的", "Subscription not found. The link may have been reset; contact support for a new one"), support: true };

  const owner = await db()
    .prepare("SELECT customer_id FROM subscriptions WHERE marzban_username = ?")
    .bind(info.username)
    .first<{ customer_id: number }>();
  if (owner?.customer_id === customer.id) return { ok: t("这个订阅已经在你的账号下了", "This subscription is already in your account") };
  if (owner) return { error: t("这个订阅已经绑定在别的账号上了，请联系客服", "This subscription is linked to another account. Please contact support"), support: true };

  await db()
    .prepare("INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (?, ?, ?)")
    .bind(customer.id, info.username, nowSec())
    .run();
  revalidatePath("/dashboard");
  return { ok: t("绑定成功", "Linked") };
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

// 主页上隐藏 / 重新显示一个订阅。只能隐藏已过期的，或者 Marzban 上已经没有的（管理员删了）；
// Marzban 暂时连不上时不让隐藏，免得把还能用的订阅藏起来。只改 hidden_at，记录都留着
export async function hideSubscription(form: FormData) {
  const customer = await requireCustomer();
  const username = String(form.get("username") ?? "");
  const mine = await db()
    .prepare("SELECT 1 FROM subscriptions WHERE customer_id = ? AND marzban_username = ?")
    .bind(customer.id, username)
    .first();
  if (!mine) return;
  let user;
  try {
    user = await findUser(username);
  } catch {
    return;
  }
  if (user && !isExpiredSub(user, Date.now())) return;
  await db().prepare("UPDATE subscriptions SET hidden_at = ? WHERE customer_id = ? AND marzban_username = ?").bind(nowSec(), customer.id, username).run();
  revalidatePath("/dashboard");
}

export async function unhideSubscription(form: FormData) {
  const customer = await requireCustomer();
  const username = String(form.get("username") ?? "");
  await db().prepare("UPDATE subscriptions SET hidden_at = NULL WHERE customer_id = ? AND marzban_username = ?").bind(customer.id, username).run();
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
  const { t, lang } = await getT();
  if (!code) return { error: t("兑换码格式不对，是 16 位字母和数字", "Invalid redeem code: it's 16 letters and numbers") };
  // 防机器人一个个试兑换码：同一个客人输错太多次就暂停一会儿
  const tooMany = { error: t("兑换码输错次数太多，请 1 小时后再试", "Too many wrong codes. Please try again in an hour") };
  if (await overLimit("redeem_fail", String(customer.id), REDEEM_FAIL_LIMITS)) return tooMany;

  const row = await db()
    .prepare("SELECT plan_id, days, used_by FROM redeem_codes WHERE code = ?")
    .bind(code)
    .first<{ plan_id: string; days: number | null; used_by: number | null }>();
  if (!row) {
    await recordHit("redeem_fail", String(customer.id));
    return { error: t("没有这个兑换码，请检查有没有输错", "That redeem code doesn't exist. Please check for typos") };
  }
  if (row.used_by !== null) return { error: t("这个兑换码已经用过了", "This redeem code has already been used") };
  const base = findPlan(site.plans, row.plan_id);
  // 后台生成时改过天数的兑换码，开通 / 续期按码上的天数算
  const plan = base && withCodeDays(base, row.days);
  if (!plan) return { error: t("这个兑换码对应的套餐已经下架了，请联系客服", "The plan for this code is no longer available. Please contact support"), support: true };

  const { results } = await db()
    .prepare("SELECT marzban_username FROM subscriptions WHERE customer_id = ? ORDER BY id")
    .bind(customer.id)
    .all<{ marzban_username: string }>();
  const subs = results.map((r) => r.marzban_username);
  if (target !== "new" && !subs.includes(target)) return { error: t("请选择要续期的订阅", "Please choose a subscription to renew") };

  // 两个请求同时用同一个兑换码时，只有一个能占到
  const now = nowSec();
  const claim = await db()
    .prepare("UPDATE redeem_codes SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL")
    .bind(customer.id, now, code)
    .run();
  if (claim.meta.changes !== 1) return { error: t("这个兑换码已经用过了", "This redeem code has already been used") };
  const release = () =>
    db().prepare("UPDATE redeem_codes SET used_by = NULL, used_at = NULL WHERE code = ?").bind(code).run();

  // 写 Marzban 之前出错，Marzban 还没动过，放回兑换码就行
  let result: ProvisionResult;
  try {
    const r = await provisionTarget(customer.id, subs, target, plan, now, lang);
    if ("error" in r) {
      await release();
      return { error: r.error };
    }
    result = r;
  } catch (e) {
    console.error("redeem: 写 Marzban 之前出错", e);
    await release();
    return { error: t("开通失败，兑换码没有被用掉，请稍后再试。一直失败的话请联系客服", "Activation failed and your code was not used. Please try again later; if it keeps failing, contact support"), support: true };
  }

  if (result.kind === "retry") {
    console.error(`redeem: ${result.reason}`);
    await release();
    return { error: t("开通失败，兑换码没有被用掉，请稍后再试。一直失败的话请联系客服", "Activation failed and your code was not used. Please try again later; if it keeps failing, contact support"), support: true };
  }
  if (result.kind === "stuck") {
    // 兑换码保持占用（used_by 有值、order_id 为空），管理员按日志去 Marzban 核对
    console.error(`redeem: 需要人工核对 customer=${customer.id} code=${code} plan=${plan.id} ${result.reason}`);
    return {
      error: t(
        `开通的时候出了点问题，兑换码已经帮你保留，不会作废。请不要重复兑换，把这句话截图发给管理员处理（${result.username}）`,
        `Something went wrong during activation. Your code is kept and won't expire. Don't redeem it again; send a screenshot of this message to support (${result.username})`,
      ),
      support: true,
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
      // 免费体验（0 元）不记订单（订单金额必须大于 0，也不该算进收入），直接记这个订阅现在是什么套餐；
      // 谁用了哪个码，兑换码表里的 used_by / used_at 已经记着
      ...(plan.price > 0
        ? [
            db()
              .prepare(
                `INSERT INTO orders (customer_id, amount, method, status, plan_id, marzban_username, paid_at, created_at)
         VALUES (?, ?, 'redeem_code', 'paid', ?, ?, ?, ?)`,
              )
              .bind(customer.id, plan.price, plan.id, username, now, now),
            db().prepare("UPDATE redeem_codes SET order_id = last_insert_rowid() WHERE code = ?").bind(code),
          ]
        : [
            db()
              .prepare(
                `INSERT INTO subscription_plans (marzban_username, plan_id, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT (marzban_username) DO UPDATE SET plan_id = excluded.plan_id, updated_at = excluded.updated_at`,
              )
              .bind(username, plan.id, now),
          ]),
    ]);
  } catch (e) {
    // Marzban 已经开好了，兑换码也占住了，只差记账：让管理员按日志补
    console.error(`redeem: 写库失败 customer=${customer.id} user=${username} plan=${plan.id}`, e);
    return {
      error: t(`已经开通（${username}），但保存记录时出错了，请把这句话截图发给管理员处理`, `Activated (${username}), but saving the record failed. Please send a screenshot of this message to support`),
      support: true,
    };
  }
  revalidatePath("/dashboard");
  revalidatePath("/plans");
  // 流量没清零这种要提醒客人的，留在兑换页把话说完；其余直接跳到「我的订阅」，客人马上看到新开 / 续上的订阅
  if (result.warning) return { ok: doneMessage(lang, target === "new", false, planName(plan, lang), username, expire, true) };
  redirect(target === "new" ? `/dashboard?opened=${encodeURIComponent(row.plan_id)}${row.days ? `&days=${row.days}` : ""}` : "/dashboard?renewed=1");
}

// 同一个客人最多同时挂几张没处理完的单，免得有人乱点堆一堆单
const MAX_OPEN_ORDERS = 3;

// 在套餐页下单：建一张待付款的单（金额按现在的套餐价锁定）。客人转账时备注订单号，管理员确认收款后才开通。
// target 和兑换码一样："new" 或者客人名下某个订阅的用户名（续期）
// useBalance=1：用余额抵扣。余额够付全款就直接扣余额开通（buyWithBalance），不够就抵扣一部分、剩下的转账
export async function createOrder(prev: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const { t } = await getT();
  const plan = findPlan(forSale(site.plans), String(form.get("plan") ?? ""));
  if (!plan) return { error: t("这个套餐已经下架了，请刷新页面再选", "This plan is no longer available. Please refresh and choose again") };
  // 能用的余额 = 余额 - 已经抵扣在别的没付款单上的
  const avail = await db().prepare(AVAILABLE_SQL).bind(customer.id).first<{ balance: number; reserved: number }>();
  const balance = form.get("useBalance") === "1" ? Math.max(0, (avail?.balance ?? 0) - (avail?.reserved ?? 0)) : 0;
  if (balance >= plan.price) return buyWithBalance(prev, form);
  if (site.payments.length === 0) return { error: balance > 0 ? t("余额不够付这个套餐", "Not enough balance for this plan") : t("现在还不能在线下单，请用兑换码", "Online ordering isn't available yet. Please use a redeem code") };
  const target = String(form.get("target") ?? "new");
  if (target !== "new") {
    const mine = await db()
      .prepare("SELECT 1 FROM subscriptions WHERE customer_id = ? AND marzban_username = ?")
      .bind(customer.id, target)
      .first();
    if (!mine) return { error: t("请选择要续期的订阅", "Please choose a subscription to renew") };
  }

  const open = await db()
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ? AND status IN ('pending', 'processing')")
    .bind(customer.id)
    .first<{ n: number }>();
  if ((open?.n ?? 0) >= MAX_OPEN_ORDERS) return { error: t("你还有没付款的单，先付款或者取消不要的单再下新的", "You have unpaid orders. Pay or cancel them before placing a new one") };

  // 抵扣的余额只记在单上，付款时才扣（migrations/0022 的触发器），没付款的单不会让余额变少。
  // 建单是一条带条件的 INSERT：能用的余额刚好变了（比如同时下了另一张单）就插不进去，让客人重来
  const now = nowSec();
  const order = await db()
    .prepare(
      `INSERT INTO orders (customer_id, amount, balance_used, method, status, plan_id, marzban_username, created_at)
       SELECT ?1, ?2, ?3, 'transfer', 'pending', ?4, ?5, ?6
       WHERE ?3 = 0 OR ${LEDGER_SQL} - ${RESERVED_SQL} >= ?3
       RETURNING id`,
    )
    .bind(customer.id, plan.price, balance, plan.id, target === "new" ? null : target, now)
    .first<{ id: number }>();
  if (!order) return { error: t("余额刚刚变了，请刷新页面再下单", "Your balance just changed. Please refresh and order again") };
  revalidatePath("/plans");
  revalidatePath("/dashboard");
  // orderId：手机上下单后弹出这张单的付款窗（订单卡片在价目表上面，不弹的话客人看不到）
  return { ok: t("下单成功，请按上面的说明付款", "Order placed. Please pay as described above"), orderId: order!.id };
}

// 客人取消自己还没付款的单。抵扣的余额付款时才扣，取消了就不再占用。点过「我已付款」的、管理员已经在开通的（processing）都不能取消，免得付了钱又把单取消掉
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
  // 付款前不会有扣款；万一有（比如开通到一半退回的单），一起退回
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
  const { t } = await getT();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: t("订单号不对，请刷新页面", "Invalid order number. Please refresh the page") };
  // 后台对账看的是中文名，存中文
  const method = String(form.get("payMethod") ?? "");
  if (!site.payments.some((p) => pick(p.name, "zh") === method)) return { error: t("请选择你是用哪个付的款", "Please choose how you paid") };
  const payer = String(form.get("payer") ?? "").trim().slice(0, 40) || null;
  const r = await db()
    .prepare(
      `UPDATE orders SET claimed_at = ?, pay_method = ?, payer = ?
       WHERE id = ? AND customer_id = ? AND status = 'pending' AND claimed_at IS NULL`,
    )
    .bind(nowSec(), method, payer, id, customer.id)
    .run();
  if (r.meta.changes !== 1) return { error: t("这张单已经处理过了，请刷新页面", "This order has already been processed. Please refresh the page") };
  const order = await db().prepare("SELECT marzban_username, amount FROM orders WHERE id = ?").bind(id).first<{ marzban_username: string | null; amount: number }>();

  const result = await confirmTransferOrder(id, { customerId: customer.id });
  // 提醒管理员去对账（发到客服邮箱）；发不出去不影响客人
  await notifyClaimedOrder({
    label: await orderLabel(id),
    amount: `${site.currency}${formatMoney(order?.amount ?? 0)}`,
    method,
    payer,
    customer: customer.wechat ? `${customer.wechat}（${customer.email}）` : customer.email,
    activated: !("error" in result),
  }).catch((e) => console.error("claimPaid: 提醒邮件没发出去", e));
  revalidatePath("/plans");
  revalidatePath("/dashboard");
  if ("error" in result) {
    console.error(`claimPaid: 自动开通失败 order=${id} customer=${customer.id} ${result.error}`);
    return {
      error: t(
        "已经记下你付了款，但自动开通没成功。管理员会尽快帮你开通，不用重新下单",
        "We've recorded your payment, but automatic activation failed. Support will activate it shortly; no need to order again",
      ),
      support: true,
    };
  }
  // 开通好了，直接去「我的订阅」拿订阅；续期的提醒客人在客户端里刷新订阅
  redirect(order?.marzban_username ? "/dashboard?renewed=1" : "/dashboard");
}

// 忘记密码：给这个邮箱发一封带重置链接的邮件。不管邮箱有没有注册过都给同样的提示，不让人试探哪些邮箱注册过
export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const { t, lang } = await getT();
  if (!EMAIL_RE.test(email)) return { error: emailError(email, lang)!, email };
  if (!canSendMail())
    return { error: t("现在还不能自动发邮件，请联系客服帮你重置密码", "We can't send emails yet. Please contact support to reset your password"), email, support: true };
  // 防机器人：人机验证 + 同一个 IP 限次数（每个账号每小时 3 封另外还有限制）
  const ip = (await headers()).get("cf-connecting-ip") ?? "local";
  if (!(await verifyTurnstile(form, ip))) return { error: t("人机验证没通过，请再点一下验证框后重试", "Human verification failed. Please complete the check and try again"), email };
  if (await overLimit("reset", ip, RESET_IP_LIMITS)) return { error: t("申请太频繁了，请过一会儿再试", "Too many requests. Please try again later"), email };
  await recordHit("reset", ip);
  const done = {
    ok: t(
      `如果 ${email} 注册过，重置链接已经发过去了，1 小时内有效。没收到的话看看垃圾邮件。`,
      `If ${email} is registered, a reset link is on its way. It's valid for 1 hour. Check your spam folder if you don't see it.`,
    ),
  };

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
  const link = resetLink(site.siteUrl, token);
  const sent = await sendMail(
    email,
    t(`${site.brand} 重置密码`, `Reset your ${site.brand} password`),
    t(
      `${mailGreeting(t)}\n\n有人（希望是你）申请重置 ${site.brand} 账号 ${email} 的密码。打开下面的链接设置新密码，1 小时内有效，只能用一次：\n\n${link}\n\n如果不是你申请的，不用理会这封邮件，密码不会改变。${mailSupportLine(t) && `\n\n${mailSupportLine(t)}`}`,
      `${mailGreeting(t)}\n\nSomeone (hopefully you) asked to reset the password for the ${site.brand} account ${email}. Open the link below to set a new password. It's valid for 1 hour and works only once:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email. Your password won't change.${mailSupportLine(t) && `\n\n${mailSupportLine(t)}`}`,
    ),
  );
  if (!sent) return { error: t("邮件没发出去，请稍后再试，或者联系客服帮你重置", "The email couldn't be sent. Please try again later, or contact support to reset it"), email, support: true };
  return done;
}

// 用重置链接设置新密码。成功后：链接作废、这个账号的其他重置链接也作废、所有设备上的登录都退出（防止是密码泄露了），
// 然后直接在当前设备登录
export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const { t, lang } = await getT();
  const weak = passwordError(password, lang);
  if (weak) return { error: weak };
  if (password !== String(form.get("confirm") ?? "")) return { error: t("两次输入的密码不一样", "The passwords don't match") };

  const hash = await hashResetToken(token);
  const now = nowSec();
  const r = await db()
    .prepare(
      `SELECT r.customer_id, c.email FROM password_resets r JOIN customers c ON c.id = r.customer_id
       WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ?`,
    )
    .bind(hash, now)
    .first<{ customer_id: number; email: string }>();
  if (!r) return { error: t("这个链接已经失效了（用过了或者过期了），请重新申请", "This link no longer works (already used or expired). Please request a new one") };

  // 两个请求同时用同一个链接时，只有一个能占到
  const claim = await db()
    .prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL")
    .bind(now, hash)
    .run();
  if (claim.meta.changes !== 1) return { error: t("这个链接已经失效了（用过了或者过期了），请重新申请", "This link no longer works (already used or expired). Please request a new one") };

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
  const { t, lang } = await getT();
  const plan = findPlan(forSale(site.plans), String(form.get("plan") ?? ""));
  if (!plan) return { error: t("这个套餐已经下架了，请刷新页面再选", "This plan is no longer available. Please refresh and choose again") };
  const target = String(form.get("target") ?? "new");
  const { results } = await db()
    .prepare("SELECT marzban_username FROM subscriptions WHERE customer_id = ? ORDER BY id")
    .bind(customer.id)
    .all<{ marzban_username: string }>();
  const subs = results.map((r) => r.marzban_username);
  if (target !== "new" && !subs.includes(target)) return { error: t("请选择要续期的订阅", "Please choose a subscription to renew") };

  const now = nowSec();
  const order = await db()
    .prepare(
      `INSERT INTO orders (customer_id, amount, balance_used, method, status, plan_id, marzban_username, created_at)
       VALUES (?, ?, ?, 'balance', 'processing', ?, ?, ?) RETURNING id`,
    )
    .bind(customer.id, plan.price, plan.price, plan.id, target === "new" ? null : target, now)
    .first<{ id: number }>();
  const orderId = order!.id;
  // 扣款是一条带条件的 INSERT：能用的余额（减掉抵扣在没付款单上的）不够就插不进去。两个请求同时买，也不会把余额扣成负数
  const charge = await db()
    .prepare(
      `INSERT INTO balance_entries (customer_id, amount, kind, order_id, created_at)
       SELECT ?1, -?2, 'purchase', ?3, ?4
       WHERE ${LEDGER_SQL} - ${RESERVED_SQL} >= ?2`,
    )
    .bind(customer.id, plan.price, orderId, now)
    .run();
  if (charge.meta.changes !== 1) {
    await db().prepare("DELETE FROM orders WHERE id = ?").bind(orderId).run();
    return { error: t("余额不够买这个套餐", "Not enough balance for this plan") };
  }
  // Marzban 没动过时用：删掉这笔扣款，单记成已取消
  const refund = () =>
    db().batch([
      db().prepare("DELETE FROM balance_entries WHERE order_id = ? AND kind = 'purchase'").bind(orderId),
      db().prepare("UPDATE orders SET status = 'cancelled', note = '开通失败，余额已退回' WHERE id = ?").bind(orderId),
    ]);
  const failed = {
    error: t("开通失败，余额已经退回，请稍后再试。一直失败的话请联系客服", "Activation failed and your balance was refunded. Please try again later; if it keeps failing, contact support"),
    support: true,
  };

  let result: ProvisionResult;
  try {
    const r = await provisionTarget(customer.id, subs, target, plan, now, lang);
    if ("error" in r) {
      await refund();
      return { error: `${r.error}${t("（余额没有扣）", " (your balance was not charged)")}` };
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
      error: t(
        `开通的时候出了点问题，余额已经扣了，不会丢。请不要重复购买，把这句话截图发给管理员处理（${await orderLabel(orderId)}，${result.username}）`,
        `Something went wrong during activation. Your balance was charged and is safe. Don't buy again; send a screenshot of this message to support (${await orderLabel(orderId)}, ${result.username})`,
      ),
      support: true,
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
    return {
      error: t(
        `已经开通（${username}），但保存记录时出错了，请把这句话截图发给管理员处理（${await orderLabel(orderId)}）`,
        `Activated (${username}), but saving the record failed. Please send a screenshot of this message to support (${await orderLabel(orderId)})`,
      ),
      support: true,
    };
  }
  revalidatePath("/dashboard");
  revalidatePath("/plans");
  return { ok: doneMessage(lang, target === "new", true, planName(plan, lang), username, result.expire, !!result.warning) };
}

// 兑换码、余额开通成功后的提示
function doneMessage(lang: Lang, isNew: boolean, byBalance: boolean, plan: string, username: string, expire: number | null, warning: boolean): string {
  const t = makeT(lang);
  const what = isNew ? t("开通", "activated") : t("续期", "renewed");
  return (
    t(
      `${byBalance ? "用余额" : ""}${what}成功：${plan}，${username} 到期时间 ${formatExpire(expire, lang)}。`,
      `${plan} ${what}${byBalance ? " with your balance" : ""}: ${username} now expires ${formatExpire(expire, lang)}. `,
    ) +
    (isNew ? t("回到「我的订阅」就能导入使用", "Go to My subscription to import it") : RENEW_REFRESH_HINT[lang]) +
    (warning ? t("。已用流量还没清零，管理员会帮你处理", ". Your used data hasn't been reset yet; support will take care of it") : "")
  );
}


// ---- 客人自己的「账户」页 ----

// 改微信号
export async function updateWechat(_: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const wechat = String(form.get("wechat") ?? "").trim();
  const { t, lang } = await getT();
  const error = wechatError(wechat, lang);
  if (error) return { error, wechat };
  await db().prepare("UPDATE customers SET wechat = ? WHERE id = ?").bind(wechat, customer.id).run();
  await followWechatChange(customer.id, wechat);
  const claimed = await claimByWechat(customer, wechat);
  revalidatePath("/account");
  revalidatePath("/dashboard");
  if (claimed.length > 0)
    return {
      ok: t(
        `微信号已更新，找到 ${claimed.length} 个按这个微信号开的订阅，已经放进「我的订阅」`,
        `WeChat ID updated. Found ${claimed.length} subscription(s) under this WeChat ID and added them to My subscription`,
      ),
    };
  return { ok: t("微信号已更新", "WeChat ID updated") };
}

// 改登录邮箱：要输当前密码（防止别人趁你登录着把邮箱改走）；新邮箱不能被别人用过
export async function updateEmail(_: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const { t, lang } = await getT();
  const invalid = emailError(email, lang);
  if (invalid) return { error: invalid, email };
  if (email === customer.email) return { error: t("和现在的邮箱一样", "That's already your email"), email };
  const me = await db().prepare("SELECT password_hash FROM customers WHERE id = ?").bind(customer.id).first<{ password_hash: string }>();
  if (!me || !(await verifyPassword(password, me.password_hash))) return { error: t("当前密码不对", "Current password is wrong"), email };
  const taken = await db().prepare("SELECT 1 FROM customers WHERE email = ?").bind(email).first();
  if (taken) return { error: t("这个邮箱已经被别的账号用了", "This email is used by another account"), email };
  await db().prepare("UPDATE customers SET email = ? WHERE id = ?").bind(email, customer.id).run();
  revalidatePath("/account");
  return { ok: t(`登录邮箱已改成 ${email}，下次用它登录`, `Your login email is now ${email}. Use it next time you log in`) };
}

// 改密码：要输当前密码；改完其他设备上的登录都退出，这台保留
export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const { t, lang } = await getT();
  if (next !== String(form.get("confirm") ?? "")) return { error: t("两次输的新密码不一样", "The new passwords don't match") };
  const invalid = passwordError(next, lang);
  if (invalid) return { error: invalid };
  const me = await db().prepare("SELECT password_hash FROM customers WHERE id = ?").bind(customer.id).first<{ password_hash: string }>();
  if (!me || !(await verifyPassword(current, me.password_hash))) return { error: t("当前密码不对", "Current password is wrong") };
  await db().prepare("UPDATE customers SET password_hash = ? WHERE id = ?").bind(await hashPassword(next), customer.id).run();
  const out = await destroyOtherSessions(customer.id);
  revalidatePath("/account");
  return { ok: out > 0 ? t("密码已修改，其他地方的登录都已退出", "Password changed. You've been logged out everywhere else") : t("密码已修改", "Password changed") };
}

// 到期提醒邮件要不要发
export async function updatePrefs(_: FormState, form: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const notify = form.get("notify") ? 1 : 0;
  const { t } = await getT();
  await db().prepare("UPDATE customers SET notify_expiry = ? WHERE id = ?").bind(notify, customer.id).run();
  revalidatePath("/account");
  return { ok: t("已保存", "Saved") };
}

// 页面底部切换语言：记一年；登录着的顺便记到账号上，到期提醒邮件按它写
export async function setLang(lang: string) {
  const next = parseLang(lang);
  (await cookies()).set(LANG_COOKIE, next, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  const customer = await currentCustomer();
  if (customer) await db().prepare("UPDATE customers SET lang = ? WHERE id = ?").bind(next, customer.id).run();
}
