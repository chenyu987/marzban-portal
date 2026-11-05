"use server";

// 管理员「我的账户」页的 Server Actions：都先过 requireAdmin()，只改自己，记操作日志
import { revalidatePath } from "next/cache";
import { db } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { destroyOtherAdminSessions, logAdmin, requireAdmin } from "@/lib/admin";
import { passwordError } from "@/lib/account";
import { parsePrefsForm } from "@/lib/admin-account";
import type { FormState } from "../../actions";
import { getT } from "@/lib/lang";

export async function adminChangePassword(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: t("两次输的新密码不一样", "The two new passwords don't match") };
  const invalid = passwordError(next, lang);
  if (invalid) return { error: invalid };
  if (next === current) return { error: t("新密码和现在的一样", "The new password is the same as the current one") };
  const me = await db().prepare("SELECT password_hash FROM admins WHERE id = ?").bind(admin.id).first<{ password_hash: string }>();
  if (!me || !(await verifyPassword(current, me.password_hash))) return { error: t("当前密码不对", "Current password is wrong") };
  await db().prepare("UPDATE admins SET password_hash = ? WHERE id = ?").bind(await hashPassword(next), admin.id).run();
  const out = await destroyOtherAdminSessions(admin);
  await logAdmin(admin, "account.password", null, out ? `退出了其他 ${out} 个登录` : undefined);
  revalidatePath("/admin/account");
  return { ok: t(out ? `密码已修改，其他 ${out} 个地方的登录都已退出` : "密码已修改", out ? `Password changed; ${out} other session(s) logged out` : "Password changed") };
}

// 退出别的设备：sid 为空 = 除了这台全部退出；给了 sid 就只退出那一个（只能是自己的、不能是这台）
export async function adminLogoutSessions(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const sid = String(form.get("sid") ?? "");
  let out = 0;
  if (sid) {
    if (sid === admin.sid) return { error: t("这台设备请用右上角的「退出」", "Use “Log out” at the top right for this device") };
    const r = await db().prepare("DELETE FROM admin_sessions WHERE id = ? AND admin_id = ?").bind(sid, admin.id).run();
    out = r.meta.changes ?? 0;
  } else {
    out = await destroyOtherAdminSessions(admin);
  }
  await logAdmin(admin, "account.logout_others", null, `退出了 ${out} 个登录`);
  revalidatePath("/admin/account");
  return { ok: t(out ? `已退出 ${out} 个登录` : "没有别的登录", out ? `Logged out ${out} session(s)` : "No other sessions") };
}

export async function adminSavePrefs(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const r = parsePrefsForm((k) => String(form.get(k) ?? ""), lang);
  if ("error" in r) return { error: r.error };
  const { pageSize, sort, time } = r.prefs;
  await db().prepare("UPDATE admins SET pref_page_size = ?, pref_sort = ?, pref_time = ? WHERE id = ?").bind(pageSize, sort, time, admin.id).run();
  await logAdmin(admin, "account.prefs", null, `每页 ${pageSize ?? "默认"}，排序 ${sort ?? "默认"}，时间 ${time === "absolute" ? "具体日期" : "多久以后"}`);
  revalidatePath("/admin/account");
  revalidatePath("/admin/users");
  return { ok: t("已保存", "Saved") };
}
