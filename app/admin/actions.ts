"use server";

// 管理后台的 Server Actions。每个都先过 requireAdmin()（登录除外：它先过 Access），并记操作日志
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, nowSec } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { createAdminSession, currentAdmin, destroyAdminSession, logAdmin, requireAccess, requireAdmin } from "@/lib/admin";
import { cancelPendingOrder, confirmTransferOrder, type AdminResult } from "@/lib/admin-orders";
import type { FormState } from "../actions";
import { findUser } from "@/lib/marzban";
import { findPlan } from "@/lib/plans";
import { formatRedeemCode, newRedeemCode } from "@/lib/format";
import { hashResetToken, newResetToken, RESET_TTL_ADMIN, resetLink } from "@/lib/reset";
import { site } from "@/site.config";

// 和客人登录一样限制试密码；记在 login_failures 里，邮箱前面加 admin: 区分
const FAIL_WINDOW = 15 * 60;
const MAX_FAILS = 5;

export async function adminLogin(_: FormState, form: FormData): Promise<FormState> {
  const accessEmail = await requireAccess();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const key = `admin:${email}`;
  const ip = (await headers()).get("cf-connecting-ip") ?? "local";
  const since = nowSec() - FAIL_WINDOW;

  const fails = await db()
    .prepare("SELECT COUNT(*) AS n FROM login_failures WHERE email = ? AND at > ?")
    .bind(key, since)
    .first<{ n: number }>();
  if ((fails?.n ?? 0) >= MAX_FAILS) return { error: "密码错误次数太多，请 15 分钟后再试", email };

  const a = await db()
    .prepare("SELECT id, email, password_hash FROM admins WHERE email = ?")
    .bind(email)
    .first<{ id: number; email: string; password_hash: string }>();
  // 管理员邮箱要和 Access 登录的邮箱一样
  const ok = !!a && (accessEmail === null || a.email === accessEmail) && (await verifyPassword(password, a.password_hash));
  if (!ok) {
    await db().prepare("INSERT INTO login_failures (email, ip, at) VALUES (?, ?, ?)").bind(key, ip, nowSec()).run();
    await logAdmin({ id: null, email: email || "(空)" }, "login.fail", null);
    return { error: "邮箱或密码不对", email };
  }
  await db().prepare("DELETE FROM login_failures WHERE email = ?").bind(key).run();
  await createAdminSession(a!.id);
  await logAdmin({ id: a!.id, email: a!.email }, "login", null);
  redirect("/admin");
}

export async function adminLogout() {
  const a = await currentAdmin();
  if (a) await logAdmin(a, "logout", null);
  await destroyAdminSession();
  redirect("/admin/login");
}

// 不刷新页面：刷新的话这张单马上从「待处理」里消失，结果提示也跟着没了。结果显示在卡片上，下次打开页面它才挪到「最近处理过的」
const toState = (r: AdminResult): FormState => ("ok" in r ? { ok: r.ok } : { error: r.error });

export async function adminConfirmOrder(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: "订单号不对" };
  const r = await confirmTransferOrder(id);
  await logAdmin(admin, "order.confirm", `订单 ${id}`, "ok" in r ? r.ok : `失败：${r.error}`);
  return toState(r);
}

export async function adminCancelOrder(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: "订单号不对" };
  const r = await cancelPendingOrder(id);
  await logAdmin(admin, "order.cancel", `订单 ${id}`, "ok" in r ? undefined : `失败：${r.error}`);
  return toState(r);
}

// 给客人加或扣余额（补偿、冲掉记错的）。金额可以是负数，必须写原因；扣的话余额不能扣成负数
export async function adminAdjustBalance(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const customerId = Number(form.get("customerId"));
  const raw = String(form.get("amount") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  const m = /^(-?)(\d+(?:\.\d{1,2})?)$/.exec(raw);
  if (!Number.isInteger(customerId) || !m) return { error: "金额格式不对，比如 10 或 -5.5" };
  const fen = Math.round(Number(m[2]) * 100) * (m[1] ? -1 : 1);
  if (fen === 0) return { error: "金额不能是 0" };
  if (!note) return { error: "要写原因" };
  const c = await db().prepare("SELECT email FROM customers WHERE id = ?").bind(customerId).first<{ email: string }>();
  if (!c) return { error: "没有这个客人" };

  const r = await db()
    .prepare(
      `INSERT INTO balance_entries (customer_id, amount, kind, note, created_at)
       SELECT ?1, ?2, 'adjust', ?3, ?4
       WHERE (SELECT COALESCE(SUM(amount), 0) FROM balance_entries WHERE customer_id = ?1) + ?2 >= 0`,
    )
    .bind(customerId, fen, note, nowSec())
    .run();
  if (r.meta.changes !== 1) return { error: "余额不够扣" };
  await logAdmin(admin, "balance.adjust", c.email, `${fen > 0 ? "+" : ""}${(fen / 100).toFixed(2)} 元：${note}`);
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: `已${fen > 0 ? "加" : "扣"} ${(Math.abs(fen) / 100).toFixed(2)} 元` };
}

// 生成重置密码链接（24 小时、一次性），管理员发给客人。链接只显示这一次，日志里不记链接
export async function adminResetLink(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const customerId = Number(form.get("customerId"));
  const c = await db().prepare("SELECT id, email FROM customers WHERE id = ?").bind(customerId).first<{ id: number; email: string }>();
  if (!c) return { error: "没有这个客人" };
  const token = newResetToken();
  const now = nowSec();
  await db()
    .prepare("INSERT INTO password_resets (token_hash, customer_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await hashResetToken(token), c.id, now + RESET_TTL_ADMIN, now)
    .run();
  await logAdmin(admin, "password.reset_link", c.email);
  return { ok: resetLink(site.siteUrl, token) };
}

// 把 Marzban 上已有的用户绑到这个客人名下（老客人注册后，不用让他自己粘贴订阅链接）
export async function adminBindSubscription(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const customerId = Number(form.get("customerId"));
  const username = String(form.get("username") ?? "").trim();
  if (!username) return { error: "要填 Marzban 用户名" };
  const c = await db().prepare("SELECT email FROM customers WHERE id = ?").bind(customerId).first<{ email: string }>();
  if (!c) return { error: "没有这个客人" };
  const owner = await db()
    .prepare("SELECT c.email FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE s.marzban_username = ?")
    .bind(username)
    .first<{ email: string }>();
  if (owner) return { error: `${username} 已经绑在 ${owner.email} 名下了` };
  let user;
  try {
    user = await findUser(username);
  } catch (e) {
    return { error: `查 Marzban 出错：${e instanceof Error ? e.message : e}` };
  }
  if (!user) return { error: `Marzban 上没有用户 ${username}` };
  await db()
    .prepare("INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (?, ?, ?)")
    .bind(customerId, username, nowSec())
    .run();
  await logAdmin(admin, "subscription.bind", c.email, username);
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: `已把 ${username} 绑到 ${c.email} 名下` };
}

// 生成兑换码：选套餐、数量（1～100）、备注。生成的码只在这次返回里显示全，方便一次复制；日志只记数量
export async function adminCreateCodes(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const plan = findPlan(site.plans, String(form.get("plan") ?? ""));
  const count = Number(form.get("count"));
  const note = String(form.get("note") ?? "").trim();
  if (!plan) return { error: "请选套餐" };
  if (!Number.isInteger(count) || count < 1 || count > 100) return { error: "数量是 1 到 100" };
  const codes = Array.from({ length: count }, newRedeemCode);
  const now = nowSec();
  await db().batch(
    codes.map((c) =>
      db().prepare("INSERT INTO redeem_codes (code, plan_id, note, created_at) VALUES (?, ?, ?, ?)").bind(c, plan.id, note || null, now),
    ),
  );
  await logAdmin(admin, "codes.create", plan.name, `${count} 个${note ? `：${note}` : ""}`);
  revalidatePath("/admin/codes");
  return { ok: codes.map(formatRedeemCode).join("\n") };
}

// 作废还没用过的兑换码（比如发错了人）。用过的不能作废
export async function adminVoidCode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const code = String(form.get("code") ?? "");
  const r = await db().prepare("DELETE FROM redeem_codes WHERE code = ? AND used_by IS NULL").bind(code).run();
  if (r.meta.changes !== 1) return { error: "这个兑换码已经被用了，或者已经作废了" };
  await logAdmin(admin, "code.void", formatRedeemCode(code));
  // 不刷新页面：刷新的话这一行马上消失，看不到「已作废」。下次打开页面就没有它了
  return { ok: "已作废" };
}
