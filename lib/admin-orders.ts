// 转账单的开通、对账、收回。开通逻辑和命令行 scripts/orders.mjs 的 confirm 一样：
// 先把单占成「开通中」（不会被开通两次，客人也取消不了）→ 在 Marzban 开通或续期 → 记成已付款（触发推荐奖励）。
// Marzban 确认没改就把单退回「等付款」；可能改了就停在「开通中」，交给管理员去面板核对。
// 两个入口：客人点「我已付款」马上开通（先开通后对账，verified_at 留空）；管理员在后台「确认收款并开通」（同时算对过账）
import "server-only";
import { db, nowSec } from "./env";
import { findPlan } from "./plans";
import { formatExpire } from "./format";
import { provisionTarget } from "./orders";
import { findUser, modifyUser } from "./marzban";
import { site } from "../site.config";

export type AdminResult = { ok: string } | { error: string };

type OrderRow = {
  id: number;
  customer_id: number;
  method: string;
  status: string;
  plan_id: string | null;
  marzban_username: string | null;
};

const DAY = 86400;

// by = customer：客人点了「我已付款」，customerId 必须是这张单的主人；by = admin：管理员核对过钱
export async function confirmTransferOrder(
  orderId: number,
  by: { customerId: number } | "admin" = "admin",
): Promise<AdminResult> {
  const o = await db()
    .prepare("SELECT id, customer_id, method, status, plan_id, marzban_username FROM orders WHERE id = ?")
    .bind(orderId)
    .first<OrderRow>();
  if (!o || (by !== "admin" && o.customer_id !== by.customerId)) return { error: `没有订单 ${orderId}` };
  if (o.method !== "transfer" || o.status !== "pending") return { error: `订单 ${orderId} 现在不是等付款的转账单，刷新看看` };
  const plan = o.plan_id ? findPlan(site.plans, o.plan_id) : undefined;
  if (!plan) return { error: `套餐 ${o.plan_id} 已经不在 site.config.ts 里了，取消这张单，用命令行 payment:record 处理` };

  const { results } = await db()
    .prepare("SELECT marzban_username FROM subscriptions WHERE customer_id = ? ORDER BY id")
    .bind(o.customer_id)
    .all<{ marzban_username: string }>();
  const subs = results.map((r) => r.marzban_username);
  const target = o.marzban_username ?? "new";
  if (target !== "new" && !subs.includes(target)) return { error: `要续期的 ${target} 已经不在这位客人名下了，取消这张单再处理` };

  const now = nowSec();
  const claim = await db()
    .prepare("UPDATE orders SET status = 'processing' WHERE id = ? AND status = 'pending'")
    .bind(orderId)
    .run();
  if (claim.meta.changes !== 1) return { error: "单的状态刚变了（客人可能取消了），刷新看看" };
  const revert = () =>
    db().prepare("UPDATE orders SET status = 'pending' WHERE id = ? AND status = 'processing'").bind(orderId).run();

  let result;
  try {
    result = await provisionTarget(o.customer_id, subs, target, plan, now);
  } catch (e) {
    await revert();
    return { error: `连 Marzban 出错，单退回「等付款」，可以再点一次：${e instanceof Error ? e.message : e}` };
  }
  if ("error" in result) {
    await revert();
    return { error: `${result.error}（单退回「等付款」）` };
  }
  if (result.kind === "retry") {
    await revert();
    return { error: `Marzban 没有改动，单退回「等付款」，可以再点一次：${result.reason}` };
  }
  if (result.kind === "stuck") {
    return {
      error:
        `${result.reason}。Marzban 可能改了也可能没改，单停在「开通中」。先去面板看 ${result.username}，` +
        `改好了就用命令行 npm run orders -- confirm ${orderId} --done ${result.username} --remote，没改就 --again`,
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
  return {
    ok:
      `订单 ${orderId} 已确认：${target === "new" ? "新开" : "续期"} ${result.username}，到期 ${formatExpire(result.expire)}` +
      (result.warning ? `。⚠️ ${result.warning}，去面板手动把流量清零` : ""),
  };
}

// 取消等付款的单，下单时抵扣的余额退回
export async function cancelPendingOrder(orderId: number): Promise<AdminResult> {
  const r = await db().prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").bind(orderId).run();
  if (r.meta.changes !== 1) return { error: `订单 ${orderId} 已经不是「等付款」了，刷新看看` };
  await db().prepare("DELETE FROM balance_entries WHERE order_id = ? AND kind = 'purchase'").bind(orderId).run();
  return { ok: `订单 ${orderId} 已取消` };
}

// 对账：在账单里找到了这笔钱
export async function verifyOrder(orderId: number): Promise<AdminResult> {
  const r = await db()
    .prepare("UPDATE orders SET verified_at = ? WHERE id = ? AND method = 'transfer' AND status = 'paid' AND verified_at IS NULL")
    .bind(nowSec(), orderId)
    .run();
  if (r.meta.changes !== 1) return { error: `订单 ${orderId} 不是待对账的单了，刷新看看` };
  return { ok: `订单 ${orderId} 已对账` };
}

// 对账：账单里没有这笔钱。新开的订阅在 Marzban 停用；续期的把这次加上的天数扣回去（不早于现在）。
// 然后单记成 revoked，推荐奖励收回，下单时抵扣的余额退回。Marzban 改失败就什么都不动，可以再点一次
export async function revokeOrder(orderId: number): Promise<AdminResult> {
  const o = await db()
    .prepare(
      `SELECT id, plan_id, marzban_username, new_sub FROM orders
       WHERE id = ? AND method = 'transfer' AND status = 'paid' AND verified_at IS NULL`,
    )
    .bind(orderId)
    .first<{ id: number; plan_id: string | null; marzban_username: string | null; new_sub: number | null }>();
  if (!o || !o.marzban_username) return { error: `订单 ${orderId} 不是待对账的单了，刷新看看` };
  const plan = o.plan_id ? findPlan(site.plans, o.plan_id) : undefined;
  const username = o.marzban_username;
  let done: string;
  try {
    const u = await findUser(username);
    if (!u) return { error: `Marzban 上查不到 ${username}，去面板看看` };
    if (o.new_sub) {
      await modifyUser(username, { status: "disabled" });
      done = `已停用 ${username}`;
    } else {
      if (!plan) return { error: `套餐 ${o.plan_id} 已经下架，算不出要扣几天，去面板手动改 ${username} 的到期时间` };
      const now = nowSec();
      const expire = u.expire ? Math.max(now, u.expire - plan.days * DAY) : now;
      await modifyUser(username, { expire });
      done = `${username} 扣回 ${plan.days} 天，到期改成 ${formatExpire(expire)}`;
    }
  } catch (e) {
    return { error: `改 Marzban 出错，什么都没动，可以再点一次：${e instanceof Error ? e.message : e}` };
  }
  await db().batch([
    db().prepare("UPDATE orders SET status = 'revoked', note = '没收到钱，已收回' WHERE id = ?").bind(orderId),
    db().prepare("DELETE FROM balance_entries WHERE order_id = ? AND kind IN ('referral_reward', 'purchase')").bind(orderId),
  ]);
  return { ok: `订单 ${orderId} 已收回：${done}` };
}
