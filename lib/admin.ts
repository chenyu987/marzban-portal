// 管理后台的身份检查。后台每个页面和每个 Server Action 一开头都要调 requireAdmin()，不能只靠页面上不显示按钮。
// 两层，缺一不可：
//   1. Cloudflare Access：校验请求头里的 JWT（lib/access.ts），邮箱要在 site.config.ts 的 admin.emails 里。
//      没配 Access 时后台整个关闭（404）；本地开发可以用 ADMIN_DEV_NO_ACCESS=1 跳过，但只认 localhost 的请求
//   2. 后台自己的登录：admins 表（和客人账号分开），cookie 是单独的 asid；管理员邮箱必须和 Access 登录的邮箱一样
import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db, env, nowSec } from "./env";
import { verifyAccessJwt } from "./access";
import { site } from "../site.config";

const COOKIE = "asid";
const TTL = 12 * 3600;
const SEEN_EVERY = 5 * 60;

// sid：这次登录（admin_sessions.id，token 的哈希），账户页用来标出「这台设备」、退出别的设备
export type Admin = { id: number; email: string; sid: string };

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Access 那一层：通过返回邮箱；本地开发跳过时返回 null（不限制邮箱）；不通过直接 404，不让人知道有后台
export async function requireAccess(): Promise<string | null> {
  const h = await headers();
  const host = (h.get("host") ?? "").split(":")[0];
  const devSkip = (env() as unknown as { ADMIN_DEV_NO_ACCESS?: string }).ADMIN_DEV_NO_ACCESS === "1";
  if (devSkip && (host === "localhost" || host === "127.0.0.1")) return null;

  const { accessTeamDomain, accessAud, emails } = site.admin;
  const token = h.get("cf-access-jwt-assertion");
  if (!accessTeamDomain || !accessAud || !token) notFound();
  const email = await verifyAccessJwt(token, { teamDomain: accessTeamDomain, aud: accessAud });
  if (!email || !emails.map((e) => e.toLowerCase()).includes(email)) notFound();
  return email;
}

export async function currentAdmin(): Promise<Admin | null> {
  const accessEmail = await requireAccess();
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const sid = await sha256(token);
  const a = await db()
    .prepare(
      `SELECT a.id, a.email, s.last_seen_at FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .bind(sid, nowSec())
    .first<{ id: number; email: string; last_seen_at: number | null }>();
  if (!a) return null;
  // 两层必须是同一个人
  if (accessEmail !== null && a.email.toLowerCase() !== accessEmail) return null;
  // 「最后活动」：5 分钟内不重复写
  if (!a.last_seen_at || nowSec() - a.last_seen_at > SEEN_EVERY) {
    await db().prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?").bind(nowSec(), sid).run();
  }
  return { id: a.id, email: a.email, sid };
}

export async function requireAdmin(): Promise<Admin> {
  const a = await currentAdmin();
  if (!a) redirect("/admin/login");
  return a;
}

export async function createAdminSession(adminId: number) {
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const now = nowSec();
  const h = await headers();
  const ua = (h.get("user-agent") ?? "").slice(0, 300);
  const ip = h.get("cf-connecting-ip") ?? "local";
  await db().batch([
    db().prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
    db()
      .prepare("INSERT INTO admin_sessions (id, admin_id, expires_at, created_at, user_agent, ip, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(await sha256(token), adminId, now + TTL, now, ua, ip, now),
    db().prepare("UPDATE admins SET last_login_at = ? WHERE id = ?").bind(now, adminId),
  ]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: TTL,
  });
}

export async function destroyAdminSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db().prepare("DELETE FROM admin_sessions WHERE id = ?").bind(await sha256(token)).run();
  jar.delete({ name: COOKIE, path: "/admin" });
}

// 退出这个管理员别的登录（改密码、账户页「退出其他设备」用），返回退出了几个
export async function destroyOtherAdminSessions(admin: Admin): Promise<number> {
  const r = await db().prepare("DELETE FROM admin_sessions WHERE admin_id = ? AND id != ?").bind(admin.id, admin.sid).run();
  return r.meta.changes ?? 0;
}

// 后台偏好（账户页设置）。没设过是 null，用默认
export type AdminPrefs = { pageSize: number | null; sort: string | null; time: "relative" | "absolute" };
export async function adminPrefs(adminId: number): Promise<AdminPrefs> {
  const r = await db()
    .prepare("SELECT pref_page_size, pref_sort, pref_time FROM admins WHERE id = ?")
    .bind(adminId)
    .first<{ pref_page_size: number | null; pref_sort: string | null; pref_time: string | null }>();
  return { pageSize: r?.pref_page_size ?? null, sort: r?.pref_sort ?? null, time: r?.pref_time === "absolute" ? "absolute" : "relative" };
}

// 操作日志：谁、什么时候、对谁、做了什么
export async function logAdmin(admin: { id: number | null; email: string }, action: string, target: string | null, detail?: string) {
  const ip = (await headers()).get("cf-connecting-ip") ?? "local";
  await db()
    .prepare("INSERT INTO admin_logs (admin_id, admin_email, action, target, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(admin.id, admin.email, action, target, detail ?? null, ip, nowSec())
    .run();
}
