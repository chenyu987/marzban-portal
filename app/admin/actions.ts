"use server";

// 管理后台的 Server Actions。每个都先过 requireAdmin()（登录除外：它先过 Access），并记操作日志
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, nowSec } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { createAdminSession, currentAdmin, destroyAdminSession, logAdmin, requireAccess, requireAdmin } from "@/lib/admin";
import { cancelPendingOrder, confirmTransferOrder, type AdminResult } from "@/lib/admin-orders";
import type { FormState } from "../actions";

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
