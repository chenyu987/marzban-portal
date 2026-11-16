"use server";

// 管理后台的 Server Actions。每个都先过 requireAdmin()（登录除外：它先过 Access），并记操作日志
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, nowSec } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { createAdminSession, currentAdmin, destroyAdminSession, logAdmin, requireAccess, requireAdmin } from "@/lib/admin";
import { cancelPendingOrder, confirmTransferOrder, orderLabel, revokeOrder, verifyOrder, type AdminResult } from "@/lib/admin-orders";
import type { FormState } from "../actions";
import { MarzbanError, addNode, createUser, deleteExpiredUsers, deleteNode, deleteUser, expiredUsers, findUser, getHosts, resetAllUsage, listNodes, putHosts, modifyNode, modifyUser, reconnectNode, resetUsage, restartCore, revokeSubscription, vlessInbounds } from "@/lib/marzban";
import { changePlanBody, planInbounds } from "@/lib/plans";
import { createUserBody, describeChanges, parseOnHoldDays, parseExpiredDays, parseNodeForm, parseUserForm, validateHosts, USERNAME_RE, type UserFields } from "@/lib/admin-users";
import { formatBytes, formatExpire, RESET_LABEL } from "@/lib/format";
import { findPlan } from "@/lib/plans";
import { formatRedeemCode, newRedeemCode } from "@/lib/format";
import { codeMessages, parseCodeDays, withCodeDays } from "@/lib/redeem-codes";
import { hashResetToken, newResetToken, RESET_TTL_ADMIN, resetLink } from "@/lib/reset";
import { site } from "@/site.config";
import { wechatError } from "@/lib/account";
import { getT } from "@/lib/lang";
import { planName as planLabel } from "@/lib/plan-text";
import { dnsZones, getRecord, setRecordIp } from "@/lib/cloudflare-dns";
import { checkIPv4, inZone, switchable } from "@/lib/dns-switch";
import { roleFor, roleText, type StandbyRole } from "@/lib/standby";
import { lineState, standbyConfig, standbyIp } from "@/lib/standby-state";

// 和客人登录一样限制试密码；记在 login_failures 里，邮箱前面加 admin: 区分
const FAIL_WINDOW = 15 * 60;
const MAX_FAILS = 5;

export async function adminLogin(_: FormState, form: FormData): Promise<FormState> {
  const accessEmail = await requireAccess();
  const { t } = await getT();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const key = `admin:${email}`;
  const ip = (await headers()).get("cf-connecting-ip") ?? "local";
  const since = nowSec() - FAIL_WINDOW;

  const fails = await db()
    .prepare("SELECT COUNT(*) AS n FROM login_failures WHERE email = ? AND at > ?")
    .bind(key, since)
    .first<{ n: number }>();
  if ((fails?.n ?? 0) >= MAX_FAILS) return { error: t("密码错误次数太多，请 15 分钟后再试", "Too many wrong passwords. Try again in 15 minutes"), email };

  const a = await db()
    .prepare("SELECT id, email, password_hash FROM admins WHERE email = ?")
    .bind(email)
    .first<{ id: number; email: string; password_hash: string }>();
  // 管理员邮箱要和 Access 登录的邮箱一样
  const ok = !!a && (accessEmail === null || a.email === accessEmail) && (await verifyPassword(password, a.password_hash));
  if (!ok) {
    await db().prepare("INSERT INTO login_failures (email, ip, at) VALUES (?, ?, ?)").bind(key, ip, nowSec()).run();
    await logAdmin({ id: null, email: email || "(空)" }, "login.fail", null);
    return { error: t("邮箱或密码不对", "Wrong email or password"), email };
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
  const { t, lang } = await getT();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: t("订单号不对", "Invalid order") };
  const r = await confirmTransferOrder(id, "admin", lang);
  await logAdmin(admin, "order.confirm", await orderLabel(id), "ok" in r ? r.ok : `失败：${r.error}`);
  return toState(r);
}

export async function adminVerifyOrder(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: t("订单号不对", "Invalid order") };
  const r = await verifyOrder(id, lang);
  await logAdmin(admin, "order.verify", await orderLabel(id), "ok" in r ? undefined : `失败：${r.error}`);
  return toState(r);
}

export async function adminRevokeOrder(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: t("订单号不对", "Invalid order") };
  const r = await revokeOrder(id, lang);
  await logAdmin(admin, "order.revoke", await orderLabel(id), "ok" in r ? r.ok : `失败：${r.error}`);
  return toState(r);
}

export async function adminCancelOrder(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return { error: t("订单号不对", "Invalid order") };
  const r = await cancelPendingOrder(id, lang);
  await logAdmin(admin, "order.cancel", await orderLabel(id), "ok" in r ? undefined : `失败：${r.error}`);
  return toState(r);
}

// 给客人加或扣余额（补偿、冲掉记错的）。金额可以是负数，必须写原因；扣的话余额不能扣成负数
export async function adminAdjustBalance(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const customerId = Number(form.get("customerId"));
  const raw = String(form.get("amount") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  const m = /^(-?)(\d+(?:\.\d{1,2})?)$/.exec(raw);
  if (!Number.isInteger(customerId) || !m) return { error: t("金额格式不对，比如 10 或 -5.5", "Invalid amount, e.g. 10 or -5.5") };
  const fen = Math.round(Number(m[2]) * 100) * (m[1] ? -1 : 1);
  if (fen === 0) return { error: t("金额不能是 0", "Amount can't be 0") };
  if (!note) return { error: t("要写原因", "A reason is required") };
  const c = await db().prepare("SELECT email FROM customers WHERE id = ?").bind(customerId).first<{ email: string }>();
  if (!c) return { error: t("没有这个客人", "No such customer") };

  const r = await db()
    .prepare(
      `INSERT INTO balance_entries (customer_id, amount, kind, note, created_at)
       SELECT ?1, ?2, 'adjust', ?3, ?4
       WHERE (SELECT COALESCE(SUM(amount), 0) FROM balance_entries WHERE customer_id = ?1) + ?2 >= 0`,
    )
    .bind(customerId, fen, note, nowSec())
    .run();
  if (r.meta.changes !== 1) return { error: t("余额不够扣", "Not enough balance to deduct") };
  await logAdmin(admin, "balance.adjust", c.email, `${fen > 0 ? "+" : ""}${(fen / 100).toFixed(2)} 元：${note}`);
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: t(`已${fen > 0 ? "加" : "扣"} ${(Math.abs(fen) / 100).toFixed(2)} 元`, `${fen > 0 ? "Added" : "Deducted"} ${(Math.abs(fen) / 100).toFixed(2)}`) };
}

// 生成重置密码链接（24 小时、一次性），管理员发给客人。链接只显示这一次，日志里不记链接
export async function adminResetLink(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const customerId = Number(form.get("customerId"));
  const c = await db().prepare("SELECT id, email FROM customers WHERE id = ?").bind(customerId).first<{ id: number; email: string }>();
  if (!c) return { error: t("没有这个客人", "No such customer") };
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
  const { t } = await getT();
  const customerId = Number(form.get("customerId"));
  const username = String(form.get("username") ?? "").trim();
  if (!username) return { error: t("要填 Marzban 用户名", "Enter a Marzban username") };
  const c = await db().prepare("SELECT email FROM customers WHERE id = ?").bind(customerId).first<{ email: string }>();
  if (!c) return { error: t("没有这个客人", "No such customer") };
  const owner = await db()
    .prepare("SELECT c.email FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE s.marzban_username = ?")
    .bind(username)
    .first<{ email: string }>();
  if (owner) return { error: t(`${username} 已经绑在 ${owner.email} 名下了`, `${username} is already linked to ${owner.email}`) };
  let user;
  try {
    user = await findUser(username);
  } catch (e) {
    return { error: t(`查 Marzban 出错：${e instanceof Error ? e.message : e}`, `Marzban error: ${e instanceof Error ? e.message : e}`) };
  }
  if (!user) return { error: t(`Marzban 上没有用户 ${username}`, `No Marzban user ${username}`) };
  await db()
    .prepare("INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (?, ?, ?)")
    .bind(customerId, username, nowSec())
    .run();
  await logAdmin(admin, "subscription.bind", c.email, username);
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: t(`已把 ${username} 绑到 ${c.email} 名下`, `Linked ${username} to ${c.email}`) };
}

// 生成兑换码：选套餐、天数（默认按套餐，可以加减）、数量（1～100）、备注。生成的码只在这次返回里显示全，方便一次复制；日志只记数量。
// 另外给两段直接发给客人的话（short 只有兑换码，long 带用法）
export type CodesState = (FormState & { short?: string; long?: string }) | undefined;
export async function adminCreateCodes(_: CodesState, form: FormData): Promise<CodesState> {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const base = findPlan(site.plans, String(form.get("plan") ?? ""));
  const count = Number(form.get("count"));
  const note = String(form.get("note") ?? "").trim();
  if (!base) return { error: t("请选套餐", "Choose a plan") };
  if (!Number.isInteger(count) || count < 1 || count > 100) return { error: t("数量是 1 到 100", "Quantity must be 1 to 100") };
  const parsed = parseCodeDays(String(form.get("days") ?? ""), base, lang);
  if ("error" in parsed) return { error: parsed.error };
  const plan = withCodeDays(base, parsed.days);
  const codes = Array.from({ length: count }, newRedeemCode);
  const now = nowSec();
  await db().batch(
    codes.map((c) =>
      db()
        .prepare("INSERT INTO redeem_codes (code, plan_id, days, note, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(c, plan.id, parsed.days, note || null, now),
    ),
  );
  await logAdmin(admin, "codes.create", plan.name, `${count} 个${note ? `：${note}` : ""}`);
  revalidatePath("/admin/codes");
  return { ok: codes.map(formatRedeemCode).join("\n"), ...codeMessages(codes, plan, site.brand, site.siteUrl) };
}

// 作废还没用过的兑换码（比如发错了人）。用过的不能作废
export async function adminVoidCode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const code = String(form.get("code") ?? "");
  const r = await db().prepare("DELETE FROM redeem_codes WHERE code = ? AND used_by IS NULL").bind(code).run();
  if (r.meta.changes !== 1) return { error: t("这个兑换码已经被用了，或者已经作废了", "This code has already been used or voided") };
  await logAdmin(admin, "code.void", formatRedeemCode(code));
  // 不刷新页面：刷新的话这一行马上消失，看不到「已作废」。下次打开页面就没有它了
  return { ok: t("已作废", "Voided") };
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
  const { t, lang } = await getT();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return { error: t("订阅名只能是 3–32 位小写字母、数字、下划线", "Name must be 3–32 lowercase letters, digits or underscores") };
  const r = parseUserForm(formGetter(form), { now: nowSec() }, lang);
  if ("error" in r) return { error: r.error };
  const hold = parseOnHoldDays(String(form.get("onHoldDays") ?? ""), lang);
  if ("error" in hold) return { error: hold.error };

  // 选填：绑到客人名下，按邮箱或微信号找
  const who = String(form.get("customer") ?? "").trim();
  let customer: { id: number; email: string } | null = null;
  if (who) {
    customer = await db()
      .prepare("SELECT id, email FROM customers WHERE email = ?1 OR wechat = ?2")
      .bind(who.toLowerCase(), who)
      .first<{ id: number; email: string }>();
    if (!customer) return { error: t(`没有邮箱或微信号是 ${who} 的客人`, `No customer with email or WeChat ID ${who}`) };
  }

  try {
    if (await findUser(username)) return { error: t(`Marzban 上已经有 ${username} 了，换个名字`, `${username} already exists on Marzban; pick another name`) };
    await createUser(createUserBody(username, r.fields, hold.days));
  } catch (e) {
    return { error: t(`新建失败：${errText(e)}`, `Create failed: ${errText(e)}`) };
  }
  if (customer) {
    await db()
      .prepare("INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (?, ?, ?)")
      .bind(customer.id, username, nowSec())
      .run();
  }
  const detail = [
    fieldText("data_limit", r.fields.data_limit),
    hold.days ? `首次连上后 ${hold.days} 天` : fieldText("expire", r.fields.expire),
    fieldText("note", r.fields.note),
  ].join("；");
  await logAdmin(admin, "user.create", username, customer ? `${detail}；绑到 ${customer.email}` : detail);
  redirect(`/admin/users/${encodeURIComponent(username)}`);
}

export async function adminEditUser(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const username = String(form.get("username") ?? "");
  let current;
  try {
    current = await findUser(username);
  } catch (e) {
    return { error: t(`查 Marzban 出错：${errText(e)}`, `Marzban error: ${errText(e)}`) };
  }
  if (!current) return { error: t(`Marzban 上没有 ${username}`, `${username} not found on Marzban`) };
  const r = parseUserForm(formGetter(form), { now: nowSec(), currentExpire: current.expire }, lang);
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
    return { error: t(`保存失败：${errText(e)}`, `Save failed: ${errText(e)}`) };
  }
  await logAdmin(admin, "user.edit", username, describeChanges(before, r.fields, fieldText));
  revalidatePath(`/admin/users/${encodeURIComponent(username)}`);
  return { ok: t("已保存到 Marzban", "Saved to Marzban") };
}

export async function adminResetUsage(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const username = String(form.get("username") ?? "");
  try {
    await resetUsage(username);
  } catch (e) {
    return { error: t(`清零失败：${errText(e)}`, `Reset failed: ${errText(e)}`) };
  }
  await logAdmin(admin, "user.reset_usage", username);
  revalidatePath(`/admin/users/${encodeURIComponent(username)}`);
  return { ok: t("流量已清零", "Traffic reset") };
}

export async function adminRevokeSub(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const username = String(form.get("username") ?? "");
  try {
    await revokeSubscription(username);
  } catch (e) {
    return { error: t(`重置失败：${errText(e)}`, `Reset failed: ${errText(e)}`) };
  }
  await logAdmin(admin, "user.revoke_sub", username);
  revalidatePath(`/admin/users/${encodeURIComponent(username)}`);
  return { ok: t("订阅链接已重置，把新链接发给客人", "Subscription link reset. Send the new link to the customer") };
}

// 删 Marzban 用户，同时解除和客人的绑定（不然客人订阅页一直显示「查不到」）。订单记录不动
export async function adminDeleteUser(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const username = String(form.get("username") ?? "");
  const owner = await db()
    .prepare("SELECT c.email FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE s.marzban_username = ?")
    .bind(username)
    .first<{ email: string }>();
  try {
    await deleteUser(username);
  } catch (e) {
    return { error: t(`删除失败：${errText(e)}`, `Delete failed: ${errText(e)}`) };
  }
  await db().prepare("DELETE FROM subscriptions WHERE marzban_username = ?").bind(username).run();
  await logAdmin(admin, "user.delete", username, owner ? `原来绑在 ${owner.email} 名下` : undefined);
  redirect("/admin/users");
}

// 删除客人：先把他名下的订阅从 Marzban 删掉，再注销账号。
// 订单、余额流水、提现记录留着（账目要对得上，推荐人的返利也指着这些订单），客人那一行改成匿名的、记下 deleted_at：
// 邮箱、微信号、推荐码换掉，登录、找回密码、用推荐码注册都不行了，同一个邮箱以后能重新注册。
// 还有钱没处理完（客人说已付款还没开通的单、等打款的提现）不让删，先处理
export async function adminDeleteCustomer(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const id = Number(form.get("customerId"));
  const c = Number.isInteger(id)
    ? await db().prepare("SELECT id, email, wechat, deleted_at FROM customers WHERE id = ?").bind(id).first<{ id: number; email: string; wechat: string | null; deleted_at: number | null }>()
    : null;
  if (!c || c.deleted_at) return { error: t("没有这个客人，或者已经删掉了", "No such customer, or already deleted") };
  // 前端输过一遍邮箱，后端再对一次
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== c.email.toLowerCase()) return { error: t("输入的邮箱对不上，没删", "The email you typed doesn't match; nothing deleted") };
  const busy = await db()
    .prepare(
      `SELECT (SELECT COUNT(*) FROM orders WHERE customer_id = ?1 AND (status = 'processing' OR (status = 'pending' AND claimed_at IS NOT NULL))) AS orders,
         (SELECT COUNT(*) FROM withdrawals WHERE customer_id = ?1 AND status = 'pending') AS withdrawals`,
    )
    .bind(id)
    .first<{ orders: number; withdrawals: number }>();
  if (busy?.orders) return { error: t(`他有 ${busy.orders} 张说已付款、还没处理完的单，先在订单页处理`, `They have ${busy.orders} order(s) marked paid that aren't finished; handle them on the Orders page first`) };
  if (busy?.withdrawals) return { error: t("他有一笔等打款的提现，先处理", "They have a withdrawal waiting to be paid out; handle it first") };

  const { results: subs } = await db().prepare("SELECT marzban_username FROM subscriptions WHERE customer_id = ? ORDER BY id").bind(id).all<{ marzban_username: string }>();
  const removed: string[] = [];
  for (const { marzban_username: name } of subs) {
    try {
      await deleteUser(name);
    } catch (e) {
      // Marzban 上本来就没有了，算删掉
      if (!(e instanceof MarzbanError && e.status === 404)) {
        if (removed.length) {
          await db().batch(removed.map((n) => db().prepare("DELETE FROM subscriptions WHERE marzban_username = ?").bind(n)));
          await logAdmin(admin, "user.delete", removed.join("、"), `删除客人 ${c.email} 时删的，客人没删成`);
        }
        return { error: t(`删订阅 ${name} 失败：${errText(e)}。${removed.length ? `已经删了 ${removed.join("、")}，` : ""}客人还没删，可以再试一次`, `Deleting subscription ${name} failed: ${errText(e)}. ${removed.length ? `Already deleted ${removed.join(", ")}; ` : ""}the customer is not deleted yet, you can try again`) };
      }
    }
    removed.push(name);
  }

  const now = nowSec();
  await db().batch([
    // 没付款的单直接取消；万一有扣过余额的（以前下单就扣），一起退回，和客人自己取消一样
    db().prepare("DELETE FROM balance_entries WHERE kind = 'purchase' AND order_id IN (SELECT id FROM orders WHERE customer_id = ? AND status = 'pending')").bind(id),
    db().prepare("UPDATE orders SET status = 'cancelled' WHERE customer_id = ? AND status = 'pending'").bind(id),
    db().prepare("DELETE FROM subscriptions WHERE customer_id = ?").bind(id),
    db().prepare("DELETE FROM sessions WHERE customer_id = ?").bind(id),
    db().prepare("DELETE FROM password_resets WHERE customer_id = ?").bind(id),
    db()
      .prepare(
        `UPDATE customers SET email = 'deleted-' || id || '@deleted.invalid', wechat = NULL, referral_code = 'deleted-' || id,
           password_hash = '!', notify_expiry = 0, deleted_at = ? WHERE id = ?`,
      )
      .bind(now, id),
  ]);
  await logAdmin(admin, "customer.delete", c.email, `${c.wechat ? `微信 ${c.wechat}，` : ""}${removed.length ? `删了 ${removed.length} 个订阅：${removed.join("、")}` : "名下没有订阅"}`);
  revalidatePath("/admin/customers");
  redirect("/admin/customers");
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
  const { t, lang } = await getT();
  const r = parseNodeForm(formGetter(form), lang);
  if ("error" in r) return { error: r.error };
  try {
    if ((await listNodes()).some((n) => n.name === r.fields.name)) return { error: t(`已经有叫 ${r.fields.name} 的节点了`, `A node named ${r.fields.name} already exists`) };
    await addNode(r.fields);
  } catch (e) {
    return { error: t(`加节点失败：${errText(e)}`, `Adding the node failed: ${errText(e)}`) };
  }
  await logAdmin(admin, "node.add", r.fields.name, `${r.fields.address}:${r.fields.port}，API ${r.fields.api_port}，倍率 ${r.fields.usage_coefficient}`);
  revalidatePath("/admin/nodes");
  return { ok: t(`已加节点 ${r.fields.name}，刷新页面看它连上没有`, `Added node ${r.fields.name}. Refresh to see whether it connected`) };
}

export async function adminEditNode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const id = nodeId(form);
  if (!id) return { error: t("节点不对", "Invalid node") };
  const r = parseNodeForm(formGetter(form), lang);
  if ("error" in r) return { error: r.error };
  try {
    await modifyNode(id, r.fields);
  } catch (e) {
    return { error: t(`保存失败：${errText(e)}`, `Save failed: ${errText(e)}`) };
  }
  await logAdmin(admin, "node.edit", r.fields.name, `${r.fields.address}:${r.fields.port}，API ${r.fields.api_port}，倍率 ${r.fields.usage_coefficient}`);
  revalidatePath("/admin/nodes");
  return { ok: t("已保存", "Saved") };
}

export async function adminToggleNode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const id = nodeId(form);
  if (!id) return { error: t("节点不对", "Invalid node") };
  const enable = !!form.get("enable");
  const name = await nodeName(id);
  try {
    await modifyNode(id, { status: enable ? "connecting" : "disabled" });
  } catch (e) {
    return { error: t(`${enable ? "启用" : "停用"}失败：${errText(e)}`, `${enable ? "Enable" : "Disable"} failed: ${errText(e)}`) };
  }
  await logAdmin(admin, enable ? "node.enable" : "node.disable", name);
  revalidatePath("/admin/nodes");
  return { ok: t(enable ? "已启用，正在连接" : "已停用", enable ? "Enabled, connecting" : "Disabled") };
}

export async function adminReconnectNode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const id = nodeId(form);
  if (!id) return { error: t("节点不对", "Invalid node") };
  try {
    await reconnectNode(id);
  } catch (e) {
    return { error: t(`重连失败：${errText(e)}`, `Reconnect failed: ${errText(e)}`) };
  }
  await logAdmin(admin, "node.reconnect", await nodeName(id));
  revalidatePath("/admin/nodes");
  return { ok: t("已发起重连，过几秒刷新看状态", "Reconnecting. Refresh in a few seconds to see the status") };
}

export async function adminDeleteNode(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const id = nodeId(form);
  if (!id) return { error: t("节点不对", "Invalid node") };
  const name = await nodeName(id);
  try {
    await deleteNode(id);
  } catch (e) {
    return { error: t(`删除失败：${errText(e)}`, `Delete failed: ${errText(e)}`) };
  }
  await logAdmin(admin, "node.delete", name);
  revalidatePath("/admin/nodes");
  return { ok: t(`已删除节点 ${name}`, `Deleted node ${name}`) };
}

export async function adminRestartCore(): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  try {
    await restartCore();
  } catch (e) {
    return { error: t(`重启失败：${errText(e)}`, `Restart failed: ${errText(e)}`) };
  }
  await logAdmin(admin, "core.restart", null);
  revalidatePath("/admin/nodes");
  return { ok: t("Xray 已重启", "Xray restarted") };
}

// ---- Host（/admin/hosts）----

// 保存一个入站的 Host：Marzban 的接口是整份替换，所以先现取全部 Host，只换掉这个入站的，别的入站原样带回去
export async function adminSaveHosts(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const tag = String(form.get("tag") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(form.get("hosts") ?? ""));
  } catch {
    return { error: t("Host 数据不对", "Invalid Host data") };
  }
  const r = validateHosts(parsed, lang);
  if ("error" in r) return { error: r.error };
  let before: number;
  try {
    const all = await getHosts();
    if (!(tag in all)) return { error: t(`Marzban 上没有入站 ${tag}`, `No inbound ${tag} on Marzban`) };
    before = all[tag].length;
    await putHosts({ ...all, [tag]: r.hosts as (typeof all)[string] });
  } catch (e) {
    return { error: t(`保存失败：${errText(e)}`, `Save failed: ${errText(e)}`) };
  }
  const off = r.hosts.filter((h) => h.is_disabled).length;
  await logAdmin(admin, "hosts.save", tag, `${before} 个 → ${r.hosts.length} 个${off ? `（${off} 个停用）` : ""}：${r.hosts.map((h) => h.remark).join("、")}`);
  revalidatePath("/admin/hosts");
  return { ok: t(`已保存 ${tag} 的 Host，客人更新订阅后生效`, `Saved Hosts for ${tag}; takes effect when customers update their subscription`) };
}

// ---- 域名切换（/admin/dns）----

// 把节点域名的 A 记录改到另一个 IP（节点被墙时换到备用机）。浏览器只传域名、记录 id 和新 IP；
// 记录现取一次，核对它确实在这个域名下、是灰色云朵的 A 记录，再改。只改 IP，TTL 和云朵状态不动
export async function adminSwitchDns(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const cfg = dnsZones();
  if ("error" in cfg) return { error: cfg.error };
  const zone = cfg.zones.find((z) => z.zone === String(form.get("zone") ?? ""));
  if (!zone) return { error: t("没配这个域名", "This domain isn't configured") };
  const recordId = String(form.get("record") ?? "");
  if (!/^[A-Za-z0-9]{1,64}$/.test(recordId)) return { error: t("记录不对", "Invalid record") };
  const ip = checkIPv4(String(form.get("ip") ?? ""));
  if ("error" in ip)
    return { error: ip.error === "format" ? t("IP 格式不对，要是四段数字，用点隔开", "Invalid IP: four numbers separated by dots") : t("这是内网或保留地址，客人连不上", "That's a private or reserved address; customers can't reach it") };
  let before: string;
  let name: string;
  let standby: { name: string; role: StandbyRole | null } | null = null;
  try {
    const r = await getRecord(zone, recordId);
    if (!inZone(r.name, zone.zone) || !switchable(r)) return { error: t("这条记录不能在这里改（只改灰色云朵的 A 记录）", "This record can't be changed here (only DNS-only A records)") };
    if (r.content === ip.ip) return { error: t(`${r.name} 已经是 ${ip.ip} 了`, `${r.name} already points to ${ip.ip}`) };
    // 新 IP 是备用机：先按「切过去以后」算它该顶替谁，一台备用机同时被两个不同的节点指着就不让切
    const sb = standbyConfig();
    if (!("error" in sb) && sb.standbys.length) {
      const state = await lineState();
      const hit = sb.standbys.find((s) => standbyIp(s.name, state.nodes) === ip.ip);
      if (hit) {
        const after = state.records.map((x) => (x.id === r.id ? { ...x, content: ip.ip } : x));
        const role = roleFor(ip.ip, after, state.hosts, state.inbounds);
        if ("error" in role) return { error: t(`不能切到备用机 ${hit.name}：${role.error}`, `Can't switch to standby ${hit.name}: ${role.error}`) };
        standby = { name: hit.name, role: role.role };
      }
    }
    before = r.content;
    name = r.name;
    await setRecordIp(zone, recordId, ip.ip);
  } catch (e) {
    return { error: t(`改 DNS 失败：${errText(e)}`, `DNS update failed: ${errText(e)}`) };
  }
  await logAdmin(admin, "dns.switch", name, `${before} → ${ip.ip}${standby ? `（备用机 ${standby.name}，${roleText(standby.role)}）` : ""}`);
  revalidatePath("/admin/dns");
  if (standby)
    return {
      ok: t(
        `${name} 已改到备用机 ${standby.name}。备用机下次来问时（一般 30 秒内）会自动${roleText(standby.role)}，之后客人陆续连上，不用更新订阅`,
        `${name} now points to standby ${standby.name}. It picks this up on its next check (usually within 30s) and starts ${roleText(standby.role, true)}; customers follow without updating their subscription`,
      ),
    };
  return { ok: t(`${name} 已改到 ${ip.ip}，客人的客户端一般 1～5 分钟内连到新 IP`, `${name} now points to ${ip.ip}; clients usually follow within 1-5 minutes`) };
}

// ---- 批量操作（/admin/users 页底）----

// 先预览：到期超过 N 天的有哪些（不改任何东西，不记日志）
export async function adminPreviewExpired(_: FormState, form: FormData): Promise<FormState & { names?: string[] }> {
  await requireAdmin();
  const { t } = await getT();
  const days = parseExpiredDays(String(form.get("days") ?? ""));
  if (!days) return { error: t("天数要写 1 到 3650 的整数", "Days must be a whole number from 1 to 3650") };
  try {
    const names = await expiredUsers(new Date(Date.now() - days * 86400_000));
    return { ok: t(names.length ? `到期超过 ${days} 天的有 ${names.length} 个` : `没有到期超过 ${days} 天的订阅`, names.length ? `${names.length} expired more than ${days} days ago` : `None expired more than ${days} days ago`), names };
  } catch (e) {
    return { error: t(`查 Marzban 出错：${errText(e)}`, `Marzban error: ${errText(e)}`) };
  }
}

// 删到期超过 N 天的用户，同时解除和客人的绑定（订单记录不动）
export async function adminDeleteExpired(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  const days = parseExpiredDays(String(form.get("days") ?? ""));
  if (!days) return { error: t("天数要写 1 到 3650 的整数", "Days must be a whole number from 1 to 3650") };
  let names: string[];
  try {
    names = await deleteExpiredUsers(new Date(Date.now() - days * 86400_000));
  } catch (e) {
    return { error: t(`删除失败：${errText(e)}`, `Delete failed: ${errText(e)}`) };
  }
  if (names.length) {
    await db().batch(names.map((n) => db().prepare("DELETE FROM subscriptions WHERE marzban_username = ?").bind(n)));
  }
  await logAdmin(admin, "users.delete_expired", `到期超过 ${days} 天`, names.length ? `${names.length} 个：${names.join("、")}` : "0 个");
  revalidatePath("/admin/users");
  return { ok: t(`已删除 ${names.length} 个订阅`, `Deleted ${names.length} subscription(s)`) };
}

export async function adminResetAllUsage(): Promise<FormState> {
  const admin = await requireAdmin();
  const { t } = await getT();
  try {
    await resetAllUsage();
  } catch (e) {
    return { error: t(`清零失败：${errText(e)}`, `Reset failed: ${errText(e)}`) };
  }
  await logAdmin(admin, "users.reset_all_usage", "全部订阅");
  revalidatePath("/admin/users");
  return { ok: t("全部订阅的已用流量已清零", "Used traffic reset on all subscriptions") };
}

// 在订阅页把订阅绑到客人（按邮箱或微信号找客人）
export async function adminBindUser(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const { t } = await getT();
  const who = String(form.get("who") ?? "").trim();
  const c = await db()
    .prepare("SELECT id FROM customers WHERE email = ?1 OR wechat = ?2 COLLATE NOCASE")
    .bind(who.toLowerCase(), who)
    .all<{ id: number }>();
  if (c.results.length === 0) {
    // 不是邮箱的话，可以先把它记成这个订阅的微信号，客人以后用这个微信号注册时自动绑过来（见 BindToCustomer）
    const hint = who.includes("@") ? "" : t("。可以先记下这个微信号，客人以后用它注册会自动绑过来", ". You can record this WeChat ID now; it links automatically when the customer registers with it");
    return { error: t(`没有邮箱或微信号是 ${who} 的客人${hint}`, `No customer with email or WeChat ID ${who}${hint}`), wechat: who.includes("@") ? undefined : who };
  }
  if (c.results.length > 1) return { error: t(`有 ${c.results.length} 个客人的微信号是 ${who}，请填邮箱`, `${c.results.length} customers have WeChat ID ${who}; enter an email instead`) };
  const f = new FormData();
  f.set("customerId", String(c.results[0].id));
  f.set("username", String(form.get("username") ?? ""));
  // 复用客人页的绑定：查重、查 Marzban、记日志都在里面
  const r = await adminBindSubscription(undefined, f);
  if (r?.ok) revalidatePath(`/admin/users/${encodeURIComponent(String(form.get("username") ?? ""))}`);
  return r;
}

// 订阅还没绑客人、也没有这个微信号的注册客人时：先记下订阅的微信号（存在 marzban_users.wechat，和老订阅一样）。
// 后台按微信号能搜到；客人以后用这个微信号注册或改成这个微信号，就自动绑过去（lib/claim.ts）。已经记过的话改成新的
export async function adminSetSubWechat(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const username = String(form.get("username") ?? "");
  const wechat = String(form.get("wechat") ?? "").trim();
  const bad = wechatError(wechat, lang);
  if (bad) return { error: bad };
  if (!(await findUser(username))) return { error: t(`Marzban 上没有 ${username}`, `${username} not found on Marzban`) };
  const owned = await db().prepare("SELECT 1 FROM subscriptions WHERE marzban_username = ?").bind(username).first();
  if (owned) return { error: t("这个订阅已经绑了客人，不用再记微信号", "This subscription is already linked to a customer; no need to record a WeChat ID") };
  const before = (await db().prepare("SELECT wechat FROM marzban_users WHERE marzban_username = ?").bind(username).first<{ wechat: string | null }>())?.wechat;
  await db()
    .prepare(
      `INSERT INTO marzban_users (marzban_username, wechat) VALUES (?, ?)
       ON CONFLICT (marzban_username) DO UPDATE SET wechat = excluded.wechat`,
    )
    .bind(username, wechat)
    .run();
  await logAdmin(admin, "user.set_wechat", username, before ? `${before} → ${wechat}` : wechat);
  revalidatePath(`/admin/users/${encodeURIComponent(username)}`);
  revalidatePath("/admin/users");
  return { ok: t(`已记下微信号 ${wechat}，客人用这个微信号注册后会自动绑过来`, `Recorded WeChat ID ${wechat}; it links automatically when the customer registers with it`) };
}

// 改套餐：按新套餐改 Marzban 上的流量上限、重置方式、设备数（ip=N）、档位对应的入站，到期时间不动；记下现在的套餐，客人订阅页标题跟着变
export async function adminChangePlan(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const username = String(form.get("username") ?? "");
  const plan = findPlan(site.plans, String(form.get("plan") ?? ""));
  if (!plan) return { error: t("请选套餐", "Choose a plan") };
  let current;
  try {
    current = await findUser(username);
    if (!current) return { error: t(`Marzban 上没有 ${username}`, `${username} not found on Marzban`) };
    const proOnly = site.proOnlyInbounds;
    const vless = proOnly?.length ? planInbounds(plan, await vlessInbounds(), proOnly) : undefined;
    await modifyUser(username, changePlanBody(current, plan, vless));
  } catch (e) {
    return { error: t(`改套餐失败：${errText(e)}`, `Changing plan failed: ${errText(e)}`) };
  }
  const before = await db().prepare("SELECT plan_id FROM marzban_users WHERE marzban_username = ? AND plan_id IS NOT NULL").bind(username).first<{ plan_id: string }>();
  await db()
    .prepare(
      `INSERT INTO marzban_users (marzban_username, plan_id, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (marzban_username) DO UPDATE SET plan_id = excluded.plan_id, updated_at = excluded.updated_at`,
    )
    .bind(username, plan.id, nowSec())
    .run();
  const from = before ? (findPlan(site.plans, before.plan_id)?.name ?? before.plan_id) : "没记套餐";
  await logAdmin(admin, "user.change_plan", username, `${from} → ${plan.name}`);
  revalidatePath(`/admin/users/${encodeURIComponent(username)}`);
  return { ok: t(`已改成 ${plan.name}：流量和设备数已按新套餐改好，到期时间没变`, `Switched to ${planLabel(plan, lang)}: data and device limits updated, expiry unchanged`) };
}
