"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, nowSec } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession, requireCustomer } from "@/lib/session";
import { lookupSubscription, revokeSubscription } from "@/lib/marzban";
import { newReferralCode, parseSubToken } from "@/lib/format";

// email：出错时带回去当输入框的默认值。React 19 提交后会重置表单，不带回去邮箱就被清空了
export type FormState = { error?: string; ok?: string; email?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL_RE.test(email)) return { error: "邮箱格式不对", email };
  if (password.length < 8) return { error: "密码至少 8 位", email };

  const exists = await db().prepare("SELECT 1 FROM customers WHERE email = ?").bind(email).first();
  if (exists) return { error: "这个邮箱已经注册过了，直接登录吧", email };

  const row = await db()
    .prepare(
      "INSERT INTO customers (email, password_hash, referral_code, created_at) VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind(email, await hashPassword(password), newReferralCode(), nowSec())
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
