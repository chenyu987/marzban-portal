"use server";

// 管理后台的 Server Actions。每个都先过 requireAdmin()（登录除外：它先过 Access），并记操作日志
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, nowSec } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { createAdminSession, currentAdmin, destroyAdminSession, logAdmin, requireAccess, requireAdmin } from "@/lib/admin";
import { cancelPendingOrder, confirmTransferOrder, revokeOrder, verifyOrder, type AdminResult } from "@/lib/admin-orders";
import type { FormState } from "../actions";
import { addNode, createUser, deleteExpiredUsers, deleteNode, deleteUser, expiredUsers, findUser, getHosts, resetAllUsage, listNodes, putHosts, modifyNode, modifyUser, reconnectNode, resetUsage, restartCore, revokeSubscription } from "@/lib/marzban";
import { createUserBody, describeChanges, parseExpiredDays, parseNodeForm, parseUserForm, validateHosts, USERNAME_RE, type UserFields } from "@/lib/admin-users";
import { formatBytes, formatExpire, RESET_LABEL } from "@/lib/format";
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

export async function adminVerifyOrder(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: "订单号不对" };
  const r = await verifyOrder(id);
  await logAdmin(admin, "order.verify", `订单 ${id}`, "ok" in r ? undefined : `失败：${r.error}`);
  return toState(r);
}

export async function adminRevokeOrder(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: "订单号不对" };
  const r = await revokeOrder(id);
  await logAdmin(admin, "order.revoke", `订单 ${id}`, "ok" in r ? r.ok : `失败：${r.error}`);
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

// ---- Marzban 用户（/admin/users）：直接改 Marzban，和面板是同一份数据 ----

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const formGetter = (form: FormData) => (k: string) => String(form.get(k) ?? "");

// 操作日志里怎么写每个字段
function fieldText(k: keyof UserFields, v: unknown): string {
  if (k === "expire") return `到期 ${formatExpire((v as number) || null)}`;
  if (k === "data_limit") return `流量 ${v ? formatBytes(v as number) : "不限"}`;
  if (k === "data_limit_reset_strategy") return RESET_LABEL[String(v)] ?? "不重置";
  if (k === "status") return v === "disabled" ? "停用" : "启用";
  return `备注「${v ?? ""}」`;
}

export async function adminCreateUser(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return { error: "用户名只能是 3–32 位小写字母、数字、下划线" };
  const r = parseUserForm(formGetter(form), { now: nowSec() });
  if ("error" in r) return { error: r.error };

  // 选填：绑到客人名下，按邮箱或微信号找
  const who = String(form.get("customer") ?? "").trim();
  let customer: { id: number; email: string } | null = null;
  if (who) {
    customer = await db()
      .prepare("SELECT id, email FROM customers WHERE email = ?1 OR wechat = ?2")
      .bind(who.toLowerCase(), who)
      .first<{ id: number; email: string }>();
    if (!customer) return { error: `没有邮箱或微信号是 ${who} 的客人` };
  }

  try {
    if (await findUser(username)) return { error: `Marzban 上已经有 ${username} 了，换个名字` };
    await createUser(createUserBody(username, r.fields));
  } catch (e) {
    return { error: `新建失败：${errText(e)}` };
  }
  if (customer) {
    await db()
      .prepare("INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (?, ?, ?)")
      .bind(customer.id, username, nowSec())
      .run();
  }
  const detail = (["data_limit", "expire", "note"] as const).map((k) => fieldText(k, r.fields[k])).join("；");
  await logAdmin(admin, "user.create", username, customer ? `${detail}；绑到 ${customer.email}` : detail);
  redirect(`/admin/users/${encodeURIComponent(username)}`);
}

export async function adminEditUser(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const username = String(form.get("username") ?? "");
  let current;
  try {
    current = await findUser(username);
  } catch (e) {
    return { error: `查 Marzban 出错：${errText(e)}` };
  }
  if (!current) return { error: `Marzban 上没有 ${username}` };
  const r = parseUserForm(formGetter(form), { now: nowSec(), currentExpire: current.expire });
  if ("error" in r) return { error: r.error };

  // 到期、流量用完、未激活这些状态是 Marzban 自己算的：表单上没改启用/停用就不发 status，免得把它们硬改成启用
  const before: Partial<UserFields> = {
    data_limit: current.data_limit ?? 0,
    data_limit_reset_strategy: current.data_limit_reset_strategy ?? "no_reset",
    expire: current.expire ?? 0,
    note: current.note ?? "",
    status: current.status === "disabled" ? "disabled" : "active",
  };
  const { status, ...rest } = r.fields;
  const body = status === before.status ? rest : r.fields;
  try {
    await modifyUser(username, body);
  } catch (e) {
    return { error: `保存失败：${errText(e)}` };
  }
  await logAdmin(admin, "user.edit", username, describeChanges(before, r.fields, fieldText));
  revalidatePath(`/admin/users/${encodeURIComponent(username)}`);
  return { ok: "已保存到 Marzban" };
}

export async function adminResetUsage(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const username = String(form.get("username") ?? "");
  try {
    await resetUsage(username);
  } catch (e) {
    return { error: `清零失败：${errText(e)}` };
  }
  await logAdmin(admin, "user.reset_usage", username);
  revalidatePath(`/admin/users/${encodeURIComponent(username)}`);
  return { ok: "流量已清零" };
}

export async function adminRevokeSub(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const username = String(form.get("username") ?? "");
  try {
    await revokeSubscription(username);
  } catch (e) {
    return { error: `重置失败：${errText(e)}` };
  }
  await logAdmin(admin, "user.revoke_sub", username);
  revalidatePath(`/admin/users/${encodeURIComponent(username)}`);
  return { ok: "订阅链接已重置，把新链接发给客人" };
}

// 删 Marzban 用户，同时解除和客人的绑定（不然客人订阅页一直显示「查不到」）。订单记录不动
export async function adminDeleteUser(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const username = String(form.get("username") ?? "");
  const owner = await db()
    .prepare("SELECT c.email FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE s.marzban_username = ?")
    .bind(username)
    .first<{ email: string }>();
  try {
    await deleteUser(username);
  } catch (e) {
    return { error: `删除失败：${errText(e)}` };
  }
  await db().prepare("DELETE FROM subscriptions WHERE marzban_username = ?").bind(username).run();
  await logAdmin(admin, "user.delete", username, owner ? `原来绑在 ${owner.email} 名下` : undefined);
  redirect("/admin/users");
}

// ---- 节点和核心（/admin/nodes）----

async function nodeName(id: number): Promise<string> {
  try {
    return (await listNodes()).find((n) => n.id === id)?.name ?? `节点 ${id}`;
  } catch {
    return `节点 ${id}`;
  }
}

function nodeId(form: FormData): number | null {
  const id = Number(form.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function adminAddNode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const r = parseNodeForm(formGetter(form));
  if ("error" in r) return { error: r.error };
  try {
    if ((await listNodes()).some((n) => n.name === r.fields.name)) return { error: `已经有叫 ${r.fields.name} 的节点了` };
    await addNode(r.fields);
  } catch (e) {
    return { error: `加节点失败：${errText(e)}` };
  }
  await logAdmin(admin, "node.add", r.fields.name, `${r.fields.address}:${r.fields.port}，API ${r.fields.api_port}，倍率 ${r.fields.usage_coefficient}`);
  revalidatePath("/admin/nodes");
  return { ok: `已加节点 ${r.fields.name}，刷新页面看它连上没有` };
}

export async function adminEditNode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = nodeId(form);
  if (!id) return { error: "节点不对" };
  const r = parseNodeForm(formGetter(form));
  if ("error" in r) return { error: r.error };
  try {
    await modifyNode(id, r.fields);
  } catch (e) {
    return { error: `保存失败：${errText(e)}` };
  }
  await logAdmin(admin, "node.edit", r.fields.name, `${r.fields.address}:${r.fields.port}，API ${r.fields.api_port}，倍率 ${r.fields.usage_coefficient}`);
  revalidatePath("/admin/nodes");
  return { ok: "已保存" };
}

export async function adminToggleNode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = nodeId(form);
  if (!id) return { error: "节点不对" };
  const enable = !!form.get("enable");
  const name = await nodeName(id);
  try {
    await modifyNode(id, { status: enable ? "connecting" : "disabled" });
  } catch (e) {
    return { error: `${enable ? "启用" : "停用"}失败：${errText(e)}` };
  }
  await logAdmin(admin, enable ? "node.enable" : "node.disable", name);
  revalidatePath("/admin/nodes");
  return { ok: enable ? "已启用，正在连接" : "已停用" };
}

export async function adminReconnectNode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = nodeId(form);
  if (!id) return { error: "节点不对" };
  try {
    await reconnectNode(id);
  } catch (e) {
    return { error: `重连失败：${errText(e)}` };
  }
  await logAdmin(admin, "node.reconnect", await nodeName(id));
  revalidatePath("/admin/nodes");
  return { ok: "已发起重连，过几秒刷新看状态" };
}

export async function adminDeleteNode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = nodeId(form);
  if (!id) return { error: "节点不对" };
  const name = await nodeName(id);
  try {
    await deleteNode(id);
  } catch (e) {
    return { error: `删除失败：${errText(e)}` };
  }
  await logAdmin(admin, "node.delete", name);
  revalidatePath("/admin/nodes");
  return { ok: `已删除节点 ${name}` };
}

export async function adminRestartCore(): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    await restartCore();
  } catch (e) {
    return { error: `重启失败：${errText(e)}` };
  }
  await logAdmin(admin, "core.restart", null);
  revalidatePath("/admin/nodes");
  return { ok: "Xray 已重启" };
}

// ---- Host（/admin/hosts）----

// 保存一个入站的 Host：Marzban 的接口是整份替换，所以先现取全部 Host，只换掉这个入站的，别的入站原样带回去
export async function adminSaveHosts(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const tag = String(form.get("tag") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(form.get("hosts") ?? ""));
  } catch {
    return { error: "Host 数据不对" };
  }
  const r = validateHosts(parsed);
  if ("error" in r) return { error: r.error };
  let before: number;
  try {
    const all = await getHosts();
    if (!(tag in all)) return { error: `Marzban 上没有入站 ${tag}` };
    before = all[tag].length;
    await putHosts({ ...all, [tag]: r.hosts as (typeof all)[string] });
  } catch (e) {
    return { error: `保存失败：${errText(e)}` };
  }
  const off = r.hosts.filter((h) => h.is_disabled).length;
  await logAdmin(admin, "hosts.save", tag, `${before} 个 → ${r.hosts.length} 个${off ? `（${off} 个停用）` : ""}：${r.hosts.map((h) => h.remark).join("、")}`);
  revalidatePath("/admin/hosts");
  return { ok: `已保存 ${tag} 的 Host，客人更新订阅后生效` };
}

// ---- 批量操作（/admin/users 页底）----

// 先预览：到期超过 N 天的有哪些（不改任何东西，不记日志）
export async function adminPreviewExpired(_: FormState, form: FormData): Promise<FormState & { names?: string[] }> {
  await requireAdmin();
  const days = parseExpiredDays(String(form.get("days") ?? ""));
  if (!days) return { error: "天数要写 1 到 3650 的整数" };
  try {
    const names = await expiredUsers(new Date(Date.now() - days * 86400_000));
    return { ok: names.length ? `到期超过 ${days} 天的有 ${names.length} 个` : `没有到期超过 ${days} 天的用户`, names };
  } catch (e) {
    return { error: `查 Marzban 出错：${errText(e)}` };
  }
}

// 删到期超过 N 天的用户，同时解除和客人的绑定（订单记录不动）
export async function adminDeleteExpired(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const days = parseExpiredDays(String(form.get("days") ?? ""));
  if (!days) return { error: "天数要写 1 到 3650 的整数" };
  let names: string[];
  try {
    names = await deleteExpiredUsers(new Date(Date.now() - days * 86400_000));
  } catch (e) {
    return { error: `删除失败：${errText(e)}` };
  }
  if (names.length) {
    await db().batch(names.map((n) => db().prepare("DELETE FROM subscriptions WHERE marzban_username = ?").bind(n)));
  }
  await logAdmin(admin, "users.delete_expired", `到期超过 ${days} 天`, names.length ? `${names.length} 个：${names.join("、")}` : "0 个");
  revalidatePath("/admin/users");
  return { ok: `已删除 ${names.length} 个用户` };
}

export async function adminResetAllUsage(): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    await resetAllUsage();
  } catch (e) {
    return { error: `清零失败：${errText(e)}` };
  }
  await logAdmin(admin, "users.reset_all_usage", "全部用户");
  revalidatePath("/admin/users");
  return { ok: "全部用户的已用流量已清零" };
}
