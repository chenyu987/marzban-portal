"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, nowSec } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession, requireCustomer } from "@/lib/session";
import { createUser, findUser, lookupSubscription, modifyUser, resetUsage, revokeSubscription } from "@/lib/marzban";
import { formatExpire, newReferralCode, normalizeRedeemCode, normalizeReferralCode, parseSubToken } from "@/lib/format";
import { findPlan, newUserBody, nextUsername, renewUserBody } from "@/lib/plans";
import { site } from "@/site.config";

// email：出错时带回去当输入框的默认值。React 19 提交后会重置表单，不带回去邮箱就被清空了
export type FormState = { error?: string; ok?: string; email?: string; ref?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const refInput = String(form.get("ref") ?? "").trim();
  const back = { email, ref: refInput };
  if (!EMAIL_RE.test(email)) return { error: "邮箱格式不对", ...back };
  if (password.length < 8) return { error: "密码至少 8 位", ...back };

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
      `INSERT INTO customers (email, password_hash, referral_code, referred_by, created_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(email, await hashPassword(password), newReferralCode(), referrer, nowSec())
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
  if (!info) return { error: "找不到这个订阅。链接可能已经重置过，请联系管理员要新的" };

  const owner = await db()
    .prepare("SELECT customer_id FROM subscriptions WHERE marzban_username = ?")
    .bind(info.username)
    .first<{ customer_id: number }>();
  if (owner?.customer_id === customer.id) return { ok: "这个订阅已经在你的账号下了" };
  if (owner) return { error: "这个订阅已经绑定在别的账号上了，请联系管理员" };

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
// 顺序：先占住兑换码 → 改 Marzban → 记账。Marzban 失败就把兑换码放回去，客人可以再试
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
  if (!plan) return { error: "这个兑换码对应的套餐已经下架了，请联系管理员" };

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

  let username: string;
  let expire: number | null;
  try {
    if (target === "new") {
      username = nextUsername(customer.id, subs);
      // Marzban 上万一已经有同名用户（比如管理员手动建过），序号往后挪
      while (await findUser(username)) username = nextUsername(customer.id, [...subs, username]);
      expire = (await createUser(newUserBody(username, plan, now))).expire;
    } else {
      username = target;
      const current = await findUser(username);
      if (!current) {
        await release();
        return { error: "暂时查不到这个订阅，请稍后再试或联系管理员" };
      }
      if (!current.expire) {
        await release();
        return { error: "这个订阅永不到期，不用续期。可以选「新开一个订阅」" };
      }
      expire = (await modifyUser(username, renewUserBody(current, plan, now))).expire;
      await resetUsage(username);
    }
  } catch (e) {
    console.error("redeem: Marzban 出错", e);
    await release();
    return { error: "开通失败，兑换码没有被用掉，请稍后再试。一直失败的话请联系管理员" };
  }

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
    ok: `${target === "new" ? "开通" : "续期"}成功：${plan.name}，${username} 到期时间 ${formatExpire(expire)}。回到「我的订阅」就能导入使用`,
  };
}
