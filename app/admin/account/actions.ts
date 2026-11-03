"use server";

// 管理员「我的账户」页的 Server Actions：都先过 requireAdmin()，只改自己，记操作日志
import { revalidatePath } from "next/cache";
import { db } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { destroyOtherAdminSessions, logAdmin, requireAdmin } from "@/lib/admin";
import { passwordError } from "@/lib/account";
import { parsePrefsForm } from "@/lib/admin-account";
import type { FormState } from "../../actions";

export async function adminChangePassword(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: "两次输的新密码不一样" };
  const invalid = passwordError(next);
  if (invalid) return { error: invalid };
  if (next === current) return { error: "新密码和现在的一样" };
  const me = await db().prepare("SELECT password_hash FROM admins WHERE id = ?").bind(admin.id).first<{ password_hash: string }>();
  if (!me || !(await verifyPassword(current, me.password_hash))) return { error: "当前密码不对" };
  await db().prepare("UPDATE admins SET password_hash = ? WHERE id = ?").bind(await hashPassword(next), admin.id).run();
  const out = await destroyOtherAdminSessions(admin);
  await logAdmin(admin, "account.password", null, out ? `退出了其他 ${out} 个登录` : undefined);
  revalidatePath("/admin/account");
  return { ok: out ? `密码已修改，其他 ${out} 个地方的登录都已退出` : "密码已修改" };
}

// 退出别的设备：sid 为空 = 除了这台全部退出；给了 sid 就只退出那一个（只能是自己的、不能是这台）
export async function adminLogoutSessions(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const sid = String(form.get("sid") ?? "");
  let out = 0;
  if (sid) {
    if (sid === admin.sid) return { error: "这台设备请用右上角的「退出」" };
    const r = await db().prepare("DELETE FROM admin_sessions WHERE id = ? AND admin_id = ?").bind(sid, admin.id).run();
    out = r.meta.changes ?? 0;
  } else {
    out = await destroyOtherAdminSessions(admin);
  }
  await logAdmin(admin, "account.logout_others", null, `退出了 ${out} 个登录`);
  revalidatePath("/admin/account");
  return { ok: out ? `已退出 ${out} 个登录` : "没有别的登录" };
}

export async function adminSavePrefs(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const r = parsePrefsForm((k) => String(form.get(k) ?? ""));
  if ("error" in r) return { error: r.error };
  const { pageSize, sort, time } = r.prefs;
  await db().prepare("UPDATE admins SET pref_page_size = ?, pref_sort = ?, pref_time = ? WHERE id = ?").bind(pageSize, sort, time, admin.id).run();
  await logAdmin(admin, "account.prefs", null, `每页 ${pageSize ?? "默认"}，排序 ${sort ?? "默认"}，时间 ${time === "absolute" ? "具体日期" : "多久以后"}`);
  revalidatePath("/admin/account");
  revalidatePath("/admin/users");
  return { ok: "已保存" };
}
