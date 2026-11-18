// 转账单的开通、对账、收回。开通逻辑和命令行 scripts/orders.mjs 的 confirm 一样：
// 先把单占成「开通中」（不会被开通两次，客人也取消不了）→ 在 Marzban 开通或续期 → 记成已付款（触发推荐奖励）。
// Marzban 确认没改就把单退回「等付款」；可能改了就停在「开通中」，交给管理员去面板核对。
// 两个入口：客人点「我已付款」马上开通（先开通后对账，verified_at 留空）；管理员在后台「确认收款并开通」（同时算对过账）
import "server-only";
import { db, nowSec } from "./env";
import { changePlanBody, findPlan, planInbounds } from "./plans";
import { formatExpire, formatOrderNo } from "./format";
import { provisionTarget } from "./orders";
import { findUser, modifyUser, vlessInbounds } from "./marzban";
import { site } from "../site.config";
import { makeT, type Lang } from "./i18n";

export type AdminResult = { ok: string } | { error: string };

type OrderRow = {
  id: number;
  customer_id: number;
  method: string;
  status: string;
  plan_id: string | null;
  marzban_username: string | null;
  kind: string | null;
};

const DAY = 86400;

// by = customer：客人点了「我已付款」，customerId 必须是这张单的主人；by = admin：管理员核对过钱
export async function confirmTransferOrder(
  orderId: number,
  by: { customerId: number } | "admin" = "admin",
  lang: Lang = "zh",
): Promise<AdminResult> {
  const t = makeT(lang);
  const label = () => orderLabel(orderId, lang);
  const o = await db()
    .prepare("SELECT id, customer_id, method, status, plan_id, marzban_username, kind FROM orders WHERE id = ?")
    .bind(orderId)
    .first<OrderRow>();
  if (!o || (by !== "admin" && o.customer_id !== by.customerId)) return { error: t("没有这张订单", "No such order") };
  if (o.method !== "transfer" || o.status !== "pending") return { error: t(`${await label()} 现在不是等付款的转账单，刷新看看`, `${await label()} is no longer an unpaid transfer order; refresh`) };
  const plan = o.plan_id ? findPlan(site.plans, o.plan_id) : undefined;
  if (!plan) return { error: t(`套餐 ${o.plan_id} 已经不在 site.config.ts 里了，取消这张单，用命令行 payment:record 处理`, `Plan ${o.plan_id} is no longer in site.config.ts; cancel this order and use payment:record on the command line`) };

  const { results } = await db()
    .prepare("SELECT marzban_username FROM subscriptions WHERE customer_id = ? ORDER BY id")
    .bind(o.customer_id)
    .all<{ marzban_username: string }>();
  const subs = results.map((r) => r.marzban_username);
  const target = o.marzban_username ?? "new";
  if (target !== "new" && !subs.includes(target)) return { error: t(`要续期的 ${target} 已经不在这位客人名下了，取消这张单再处理`, `${target} no longer belongs to this customer; cancel the order and handle it manually`) };

  const now = nowSec();
  const claim = await db()
    .prepare("UPDATE orders SET status = 'processing' WHERE id = ? AND status = 'pending'")
    .bind(orderId)
    .run();
  if (claim.meta.changes !== 1) return { error: t("单的状态刚变了（客人可能取消了），刷新看看", "The order just changed (the customer may have cancelled); refresh") };
  const revert = () =>
    db().prepare("UPDATE orders SET status = 'pending' WHERE id = ? AND status = 'processing'").bind(orderId).run();

  let result;
  try {
    const kind = o.kind === "upgrade" ? "upgrade" : null;
    result = await provisionTarget(o.customer_id, subs, target, plan, now, lang, kind);
  } catch (e) {
    await revert();
    return { error: t(`连 Marzban 出错，单退回「等付款」，可以再点一次：${e instanceof Error ? e.message : e}`, `Marzban error; the order is back to unpaid, you can try again: ${e instanceof Error ? e.message : e}`) };
  }
  if ("error" in result) {
    await revert();
    return { error: t(`${result.error}（单退回「等付款」）`, `${result.error} (order back to unpaid)`) };
  }
  if (result.kind === "retry") {
    await revert();
    return { error: t(`Marzban 没有改动，单退回「等付款」，可以再点一次：${result.reason}`, `Marzban wasn't changed; the order is back to unpaid, you can try again: ${result.reason}`) };
  }
  if (result.kind === "stuck") {
    return {
      error: t(
        `${result.reason}。Marzban 可能改了也可能没改，单停在「开通中」。先去面板看 ${result.username}，` +
          `改好了就用命令行 npm run orders -- confirm ${orderId} --done ${result.username} --remote，没改就 --again`,
        `${result.reason}. Marzban may or may not have changed; the order is stuck in provisioning. Check ${result.username} in the panel, ` +
          `then run npm run orders -- confirm ${orderId} --done ${result.username} --remote if it changed, or --again if not`,
      ),
    };
  }

  await db().batch([
    ...(target === "new"
      ? [
          db()
            .prepare("INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (?, ?, ?)")
            .bind(o.customer_id, result.username, now),
        ]
      : []),
    db()
      .prepare("UPDATE orders SET status = 'paid', paid_at = ?, marzban_username = ?, new_sub = ?, verified_at = ? WHERE id = ?")
      .bind(now, result.username, target === "new" ? 1 : 0, by === "admin" ? now : null, orderId),
  ]);
  const what = o.kind === "upgrade" ? t(`升级到 ${plan.name}：`, `upgraded to ${plan.name}: `) : "";
  return {
    ok: t(
      `${await label()} 已确认：${what}${target === "new" ? "新开" : o.kind === "upgrade" ? "" : "续期"} ${result.username}，到期 ${formatExpire(result.expire)}` +
        (result.warning ? `。⚠️ ${result.warning}，去面板手动把流量清零` : ""),
      `${await label()} confirmed: ${what}${target === "new" ? "created" : o.kind === "upgrade" ? "" : "renewed"} ${result.username}, expires ${formatExpire(result.expire, "en")}` +
        (result.warning ? `. ⚠️ ${result.warning}; reset the traffic manually in the panel` : ""),
    ),
  };
}

// 取消等付款的单。抵扣的余额付款时才扣，取消了就不再占用（万一已经有扣款，一起退回）
export async function cancelPendingOrder(orderId: number, lang: Lang = "zh"): Promise<AdminResult> {
  const t = makeT(lang);
  const r = await db().prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").bind(orderId).run();
  const label = await orderLabel(orderId, lang);
  if (r.meta.changes !== 1) return { error: t(`${label} 已经不是「等付款」了，刷新看看`, `${label} is no longer unpaid; refresh`) };
  await db().prepare("DELETE FROM balance_entries WHERE order_id = ? AND kind = 'purchase'").bind(orderId).run();
  return { ok: t(`${label} 已取消`, `${label} cancelled`) };
}

// 对账：在账单里找到了这笔钱
export async function verifyOrder(orderId: number, lang: Lang = "zh"): Promise<AdminResult> {
  const t = makeT(lang);
  const r = await db()
    .prepare("UPDATE orders SET verified_at = ? WHERE id = ? AND method = 'transfer' AND status = 'paid' AND verified_at IS NULL")
    .bind(nowSec(), orderId)
    .run();
  const label = await orderLabel(orderId, lang);
  if (r.meta.changes !== 1) return { error: t(`${label} 不是待对账的单了，刷新看看`, `${label} is no longer waiting to be reconciled; refresh`) };
  return { ok: t(`${label} 已对账`, `${label} reconciled`) };
}

// 对账：账单里没有这笔钱。新开的订阅在 Marzban 停用；续期的把这次加上的天数扣回去（不早于现在）。
// 然后单记成 revoked，推荐奖励收回，下单时抵扣的余额退回。Marzban 改失败就什么都不动，可以再点一次
export async function revokeOrder(orderId: number, lang: Lang = "zh"): Promise<AdminResult> {
  const t = makeT(lang);
  const label = await orderLabel(orderId, lang);
  const o = await db()
    .prepare(
      `SELECT id, plan_id, marzban_username, new_sub, kind, from_plan_id FROM orders
       WHERE id = ? AND method = 'transfer' AND status = 'paid' AND verified_at IS NULL`,
    )
    .bind(orderId)
    .first<{ id: number; plan_id: string | null; marzban_username: string | null; new_sub: number | null; kind: string | null; from_plan_id: string | null }>();
  if (!o || !o.marzban_username) return { error: t(`${label} 不是待对账的单了，刷新看看`, `${label} is no longer waiting to be reconciled; refresh`) };
  const plan = o.plan_id ? findPlan(site.plans, o.plan_id) : undefined;
  const username = o.marzban_username;
  let done: string;
  let revertPlan: D1PreparedStatement | null = null;
  try {
    const u = await findUser(username);
    if (!u) return { error: t(`Marzban 上查不到 ${username}，去面板看看`, `${username} not found on Marzban; check the panel`) };
    if (o.kind === "upgrade") {
      // 升级单：换回升级前的套餐（到期时间本来就没动）
      const from = o.from_plan_id ? findPlan(site.plans, o.from_plan_id) : undefined;
      if (!from) return { error: t(`升级前的套餐 ${o.from_plan_id} 已经下架，去后台「改套餐」手动改回去`, `The original plan ${o.from_plan_id} is retired; change ${username}'s plan back manually`) };
      await modifyUser(username, changePlanBody(u, from, planInbounds(from, await vlessInbounds(), site.proOnlyInbounds)));
      revertPlan = db().prepare("UPDATE marzban_users SET plan_id = ? WHERE marzban_username = ?").bind(from.id, username);
      done = t(`${username} 换回 ${from.name}`, `${username} switched back to ${from.name}`);
    } else if (o.new_sub) {
      await modifyUser(username, { status: "disabled" });
      done = t(`已停用 ${username}`, `disabled ${username}`);
    } else {
      if (!plan) return { error: t(`套餐 ${o.plan_id} 已经下架，算不出要扣几天，去面板手动改 ${username} 的到期时间`, `Plan ${o.plan_id} is retired so the days to take back are unknown; change ${username}'s expiry in the panel`) };
      const now = nowSec();
      const expire = u.expire ? Math.max(now, u.expire - plan.days * DAY) : now;
      await modifyUser(username, { expire });
      done = t(`${username} 扣回 ${plan.days} 天，到期改成 ${formatExpire(expire)}`, `took ${plan.days} days back from ${username}, now expires ${formatExpire(expire, "en")}`);
    }
  } catch (e) {
    return { error: t(`改 Marzban 出错，什么都没动，可以再点一次：${e instanceof Error ? e.message : e}`, `Marzban error; nothing changed, you can try again: ${e instanceof Error ? e.message : e}`) };
  }
  await db().batch([
    db().prepare("UPDATE orders SET status = 'revoked', note = '没收到钱，已收回' WHERE id = ?").bind(orderId),
    db().prepare("DELETE FROM balance_entries WHERE order_id = ? AND kind IN ('referral_reward', 'purchase')").bind(orderId),
    ...(revertPlan ? [revertPlan] : []),
  ]);
  return { ok: t(`${label} 已收回：${done}`, `${label} revoked: ${done}`) };
}

// 给人看的「订单 261103-48213」：提示、操作日志都用它，不露出内部自增 id。操作日志一直用中文（日志页按「订单 」认出订单号）
export async function orderLabel(orderId: number, lang: Lang = "zh"): Promise<string> {
  const o = await db().prepare("SELECT no FROM orders WHERE id = ?").bind(orderId).first<{ no: string | null }>();
  const no = o?.no ? formatOrderNo(o.no) : String(orderId);
  return lang === "en" ? `Order ${no}` : `订单 ${no}`;
}
