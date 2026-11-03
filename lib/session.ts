import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, nowSec } from "./env";
import { LANG_COOKIE, parseLang } from "./i18n";

const COOKIE = "sid";
const TTL = 30 * 86400;

export type Customer = { id: number; email: string; referral_code: string; wechat: string | null; notify_expiry: number };

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(customerId: number) {
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const now = nowSec();
  await db()
    .prepare("INSERT INTO sessions (id, customer_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), customerId, now + TTL, now)
    .run();
  const jar = await cookies();
  // 记下客人现在用的语言，到期提醒邮件按它写（以后在页面底部切换也会更新）
  const lang = jar.get(LANG_COOKIE)?.value;
  if (lang) await db().prepare("UPDATE customers SET lang = ? WHERE id = ?").bind(parseLang(lang), customerId).run();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL,
  });
}

export async function currentCustomer(): Promise<Customer | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return db()
    .prepare(
      `SELECT c.id, c.email, c.referral_code, c.wechat, c.notify_expiry FROM sessions s JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .bind(await sha256(token), nowSec())
    .first<Customer>();
}

export async function requireCustomer(): Promise<Customer> {
  const c = await currentCustomer();
  if (!c) redirect("/login");
  return c;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db().prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
  jar.delete(COOKIE);
}

// 退出这个客人在其他设备上的登录，当前这台保留。返回退出了几台
export async function destroyOtherSessions(customerId: number): Promise<number> {
  const token = (await cookies()).get(COOKIE)?.value;
  const keep = token ? await sha256(token) : "";
  const r = await db().prepare("DELETE FROM sessions WHERE customer_id = ? AND id <> ?").bind(customerId, keep).run();
  return r.meta.changes ?? 0;
}
